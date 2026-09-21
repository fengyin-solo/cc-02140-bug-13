import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { readers as initialReaders } from '@/data/mockData'
import { getReaderStatus } from '@/utils/library'

const STORAGE_KEY = 'library_readers'
const SEQ_KEY = 'library_reader_id_seq'

export const useReaderStore = defineStore('reader', () => {
  // 单调递增的读者 id 序列，独立持久化，删除读者后也不复用，
  // 从根本上保证新卡号不与历史卡号 / 历史借阅记录冲突
  function loadIdSeq() {
    const storedSeq = Number(localStorage.getItem(SEQ_KEY))
    if (storedSeq && Number.isInteger(storedSeq)) {
      return storedSeq
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return Math.max(...parsed.map(r => Number(r.id) || 0))
        }
      } catch (e) {
        console.error('Failed to parse stored readers:', e)
      }
    }
    return initialReaders.length
  }

  // 读取本地数据并按有效期重新计算状态，避免刚过期的读者仍显示正常
  function normalize(reader) {
    return { ...reader, status: getReaderStatus(reader.expireDate) }
  }

  const loadReaders = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed.map(normalize)
        }
      } catch (e) {
        console.error('Failed to parse stored readers:', e)
      }
    }
    return [...initialReaders].map(normalize)
  }

  const readers = ref(loadReaders())
  const loading = ref(false)
  let idSeq = loadIdSeq()

  watch(readers, (newReaders) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newReaders))
  }, { deep: true })

  function persistIdSeq() {
    localStorage.setItem(SEQ_KEY, String(idSeq))
  }
  persistIdSeq()

  const totalReaders = computed(() => readers.value.length)
  const activeReaders = computed(() =>
    readers.value.filter(r => getReaderStatus(r.expireDate) === 'active').length
  )

  function getReaderById(id) {
    return readers.value.find(reader => reader.id === id)
  }

  function getReaderByCardNo(cardNo) {
    return readers.value.find(reader => reader.cardNo === cardNo)
  }

  // 卡号是否已被其他读者占用（新增、编辑、借阅入口共用同一规则）
  function hasDuplicateCardNo(cardNo, excludeId = null) {
    const target = (cardNo || '').trim()
    return readers.value.some(reader =>
      reader.id !== excludeId && reader.cardNo === target
    )
  }

  function addReader(reader) {
    // 使用单调序列，删除后再新增也不会复用历史 id / 卡号
    const newId = ++idSeq
    persistIdSeq()
    let cardNo = (reader.cardNo || '').trim()
    if (!cardNo) {
      cardNo = `R${new Date().getFullYear()}${String(newId).padStart(5, '0')}`
    }
    // 卡号唯一规则：重复卡号一律拒绝保存
    if (hasDuplicateCardNo(cardNo)) {
      idSeq -= 1
      persistIdSeq()
      const error = new Error(`卡号 ${cardNo} 已存在，请更换后重试`)
      error.code = 'DUPLICATE_CARD_NO'
      throw error
    }
    const newReader = {
      ...reader,
      cardNo,
      id: newId,
      status: getReaderStatus(reader.expireDate)
    }
    readers.value.push(newReader)
    return { id: newId, cardNo }
  }

  function updateReader(id, data) {
    const index = readers.value.findIndex(reader => reader.id === id)
    if (index === -1) {
      return false
    }

    // id 不允许变更，卡号变更时仍需通过唯一性校验
    if (data.cardNo !== undefined) {
      const cardNo = data.cardNo.trim()
      if (hasDuplicateCardNo(cardNo, id)) {
        const error = new Error(`卡号 ${cardNo} 已存在，请更换后重试`)
        error.code = 'DUPLICATE_CARD_NO'
        throw error
      }
      data = { ...data, cardNo }
    }

    // 借阅数、注册日期等档案外字段不允许借编辑入口被覆盖
    const { id: _ignoredId, ...safeData } = data

    readers.value[index] = {
      ...readers.value[index],
      ...safeData,
      id,
      // 状态始终由有效期统一推导，边界日期也能即时生效
      status: data.expireDate !== undefined
        ? getReaderStatus(data.expireDate)
        : readers.value[index].status
    }
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
    hasDuplicateCardNo,
    addReader,
    updateReader,
    deleteReader,
    searchReaders
  }
})
