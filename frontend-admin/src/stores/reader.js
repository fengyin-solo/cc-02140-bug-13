import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { readers as initialReaders, borrowRecords as initialRecords } from '@/data/mockData'
import { useBorrowStore } from '@/stores/borrow'
import {
  formatDate,
  getReaderStatus,
  isCardNoUnique,
  getActiveBorrowCount
} from '@/utils/readerRules'

const STORAGE_KEY = 'library_readers'
const SEQ_KEY = 'library_reader_seq'

// 初始自增序列：取现有档案与既有借阅记录中出现过的最大读者 id 的较大者，
// 保证删除后新增也不会复用历史 id（复用会让新读者串到旧借阅记录、卡号撞号）
function getInitialSeq() {
  let max = 0
  for (const reader of initialReaders) {
    if (reader.id > max) max = reader.id
  }
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      for (const reader of JSON.parse(stored)) {
        if (reader.id > max) max = reader.id
      }
    } catch (e) {
      console.error('Failed to parse stored readers:', e)
    }
  }
  // 借阅记录可能引用已被删除的历史读者，序列下限也要把这些 id 算进去
  for (const record of initialRecords) {
    if (record.readerId > max) max = record.readerId
  }
  return max
}

function loadSeq() {
  const stored = Number(localStorage.getItem(SEQ_KEY))
  return Number.isFinite(stored) && stored > 0
    ? Math.max(stored, getInitialSeq())
    : getInitialSeq()
}

export const useReaderStore = defineStore('reader', () => {
  const loadReaders = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to parse stored readers:', e)
      }
    }
    return [...initialReaders]
  }

  const readers = ref(loadReaders())
  const loading = ref(false)
  const idSeq = ref(loadSeq())

  // 刷新 / 重新进入时归一化：历史卡号不迁移，但状态按有效期重算、
  // 借阅数按借阅记录重算，避免旧快照（已过期仍显示正常、计数对不上）
  ;(() => {
    const borrowStore = useBorrowStore()
    for (const reader of readers.value) {
      reader.status = getReaderStatus(reader)
      reader.borrowCount = getActiveBorrowCount(borrowStore.records, reader.id)
    }
  })()

  watch(readers, (newReaders) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newReaders))
  }, { deep: true })

  watch(idSeq, (seq) => {
    localStorage.setItem(SEQ_KEY, String(seq))
  })

  // 状态以有效期为准动态计算（不依赖保存时的静态快照，到期自动翻为已过期）
  const totalReaders = computed(() => readers.value.length)
  const activeReaders = computed(() =>
    readers.value.filter(r => getReaderStatus(r) === 'active').length
  )

  function getReaderById(id) {
    return readers.value.find(reader => reader.id === id)
  }

  function getReaderByCardNo(cardNo) {
    return readers.value.find(reader => reader.cardNo === cardNo)
  }

  function nextCardNo(id) {
    const year = new Date().getFullYear()
    const candidate = `R${year}${String(id).padStart(5, '0')}`
    // 兜底：卡号唯一规则，若极端情况下撞号则递增到不重复为止
    if (isCardNoUnique(readers.value, candidate)) return candidate
    let suffix = id + 1
    while (true) {
      const fallback = `R${year}${String(suffix).padStart(5, '0')}`
      if (isCardNoUnique(readers.value, fallback)) return fallback
      suffix += 1
    }
  }

  function addReader(reader) {
    const newId = idSeq.value + 1
    const cardNo = nextCardNo(newId)
    const type = reader.type === '教师' ? '教师' : '学生'
    const newReader = {
      ...reader,
      id: newId,
      cardNo,
      // 状态按有效期统一计算，不接受外部传入
      status: getReaderStatus(reader),
      maxBorrow: type === '教师' ? 10 : 5,
      borrowCount: 0,
      registerDate: reader.registerDate || formatDate(new Date())
    }
    readers.value.push(newReader)
    idSeq.value = newId
    return { id: newId, cardNo }
  }

  function updateReader(id, data) {
    const index = readers.value.findIndex(reader => reader.id === id)
    if (index === -1) return false

    const current = readers.value[index]

    // 卡号修改同样走唯一规则（排除自身）；卡号、注册日期不随普通资料编辑被覆盖
    if (data.cardNo !== undefined &&
        !isCardNoUnique(readers.value, data.cardNo, id)) {
      return false
    }

    const type = data.type || current.type
    const next = {
      ...current,
      ...data,
      id: current.id,
      cardNo: data.cardNo || current.cardNo,
      registerDate: current.registerDate,
      maxBorrow: type === '教师' ? 10 : 5
    }
    // 状态始终按有效期统一计算，外部无法直接写入
    next.status = getReaderStatus(next)
    // 借阅情况不接受外部覆盖，以借阅记录为真值
    next.borrowCount = getActiveBorrowCount(useBorrowStore().records, id)
    readers.value[index] = next

    // 资料更新后同步借阅详情中关联的姓名 / 卡号快照
    useBorrowStore().syncReaderInfo(id, {
      readerName: next.name,
      cardNo: next.cardNo
    })
    return true
  }

  function deleteReader(id) {
    const index = readers.value.findIndex(reader => reader.id === id)
    if (index !== -1) {
      readers.value.splice(index, 1)
      return true
    }
    return false
  }

  // 借阅情况以借阅记录为唯一真值进行重算（新增借阅 / 归还后调用）
  function refreshBorrowCounts() {
    const borrowStore = useBorrowStore()
    for (const reader of readers.value) {
      const actual = getActiveBorrowCount(borrowStore.records, reader.id)
      if (reader.borrowCount !== actual) {
        reader.borrowCount = actual
      }
    }
  }

  function searchReaders(keyword) {
    if (!keyword) return readers.value
    const lowerKeyword = keyword.toLowerCase()
    return readers.value.filter(reader =>
      reader.name.toLowerCase().includes(lowerKeyword) ||
      reader.cardNo.toLowerCase().includes(lowerKeyword) ||
      reader.phone.includes(keyword)
    )
  }

  return {
    readers,
    loading,
    totalReaders,
    activeReaders,
    getReaderById,
    getReaderByCardNo,
    addReader,
    updateReader,
    deleteReader,
    refreshBorrowCounts,
    searchReaders
  }
})
