import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { borrowRecords as initialRecords } from '@/data/mockData'
import { todayStr, addDays } from '@/utils/readerRules'

const STORAGE_KEY = 'library_borrow_records'
const SEQ_KEY = 'library_borrow_seq'

function getInitialSeq() {
  let max = 0
  for (const record of initialRecords) {
    if (record.id > max) max = record.id
  }
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      for (const record of JSON.parse(stored)) {
        if (record.id > max) max = record.id
      }
    } catch (e) {
      console.error('Failed to parse stored records:', e)
    }
  }
  return max
}

function loadSeq() {
  const stored = Number(localStorage.getItem(SEQ_KEY))
  return Number.isFinite(stored) && stored > 0
    ? Math.max(stored, getInitialSeq())
    : getInitialSeq()
}

export const useBorrowStore = defineStore('borrow', () => {
  const loadRecords = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to parse stored records:', e)
      }
    }
    return [...initialRecords]
  }

  const records = ref(loadRecords())
  const loading = ref(false)
  const idSeq = ref(loadSeq())

  watch(records, (newRecords) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords))
  }, { deep: true })

  watch(idSeq, (seq) => {
    localStorage.setItem(SEQ_KEY, String(seq))
  })

  const totalBorrowed = computed(() =>
    records.value.filter(r => r.status === 'borrowed').length
  )

  const totalOverdue = computed(() =>
    records.value.filter(r => r.status === 'overdue').length
  )

  const todayBorrows = computed(() => {
    const today = todayStr()
    return records.value.filter(r => r.borrowDate === today).length
  })

  function getRecordById(id) {
    return records.value.find(record => record.id === id)
  }

  function getRecordsByReader(readerId) {
    return records.value.filter(record => record.readerId === readerId)
  }

  // 同一读者对同一本书存在未归还记录时不允许重复借阅（重复提交 / 重复操作不会产生第二条）
  function hasActiveBorrow(readerId, bookId) {
    return records.value.some(record =>
      record.readerId === readerId &&
      record.bookId === bookId &&
      record.status !== 'returned'
    )
  }

  function addRecord(record) {
    if (hasActiveBorrow(record.readerId, record.bookId)) {
      return { success: false, reason: 'duplicate' }
    }
    const newId = idSeq.value + 1
    records.value.push({
      ...record,
      id: newId,
      borrowDate: todayStr(),
      dueDate: addDays(todayStr(), 30),
      returnDate: null,
      status: 'borrowed',
      renewCount: 0
    })
    idSeq.value = newId
    return { success: true, id: newId }
  }

  function returnBook(id) {
    const index = records.value.findIndex(record => record.id === id)
    if (index !== -1 && records.value[index].status !== 'returned') {
      records.value[index].returnDate = todayStr()
      records.value[index].status = 'returned'
      return true
    }
    return false
  }

  function renewBook(id) {
    const index = records.value.findIndex(record => record.id === id)
    if (index !== -1 && records.value[index].renewCount < 2) {
      records.value[index].dueDate = addDays(records.value[index].dueDate, 15)
      records.value[index].renewCount += 1
      return true
    }
    return false
  }

  // 读者资料更新后，同步该读者全部借阅记录上的姓名 / 卡号冗余快照
  function syncReaderInfo(readerId, info) {
    let changed = false
    for (const record of records.value) {
      if (record.readerId === readerId) {
        if (info.readerName !== undefined && record.readerName !== info.readerName) {
          record.readerName = info.readerName
          changed = true
        }
        if (info.cardNo !== undefined && record.cardNo !== info.cardNo) {
          record.cardNo = info.cardNo
          changed = true
        }
      }
    }
    return changed
  }

  function searchRecords(keyword) {
    if (!keyword) return records.value
    const lowerKeyword = keyword.toLowerCase()
    return records.value.filter(record =>
      record.readerName.toLowerCase().includes(lowerKeyword) ||
      record.bookTitle.toLowerCase().includes(lowerKeyword) ||
      record.cardNo.toLowerCase().includes(lowerKeyword)
    )
  }

  return {
    records,
    loading,
    totalBorrowed,
    totalOverdue,
    todayBorrows,
    getRecordById,
    getRecordsByReader,
    hasActiveBorrow,
    addRecord,
    returnBook,
    renewBook,
    syncReaderInfo,
    searchRecords
  }
})
