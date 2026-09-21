import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { borrowRecords as initialRecords } from '@/data/mockData'
import { formatDate, todayStr, getBorrowStatus } from '@/utils/library'

const STORAGE_KEY = 'library_borrow_records'

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

  watch(records, (newRecords) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords))
  }, { deep: true })

  // 状态统一由应还日期动态计算，刷新 / 跨天后各页面结果一致
  const totalBorrowed = computed(() =>
    records.value.filter(r => getBorrowStatus(r) === 'borrowed').length
  )

  const totalOverdue = computed(() =>
    records.value.filter(r => getBorrowStatus(r) === 'overdue').length
  )

  const todayBorrows = computed(() =>
    records.value.filter(r => r.borrowDate === todayStr()).length
  )

  function getRecordById(id) {
    return records.value.find(record => record.id === id)
  }

  function getRecordsByReader(readerId) {
    return records.value.filter(record => record.readerId === readerId)
  }

  // 读者当前未归还（借阅中 / 已逾期）的记录数，借阅数以此为准
  function getActiveBorrowCount(readerId) {
    return records.value.filter(
      record => record.readerId === readerId &&
        record.status !== 'returned' &&
        !record.returnDate
    ).length
  }

  function addRecord(record) {
    const newId = records.value.length > 0
      ? Math.max(...records.value.map(r => r.id)) + 1
      : 1
    const today = todayStr()
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    records.value.push({
      ...record,
      id: newId,
      borrowDate: today,
      dueDate: formatDate(dueDate),
      returnDate: null,
      status: 'borrowed',
      renewCount: 0
    })
    return newId
  }

  function returnBook(id) {
    const index = records.value.findIndex(record => record.id === id)
    // 已归还的记录不允许重复归还，防止重复提交导致库存 / 借阅数回退
    if (index !== -1 && records.value[index].status !== 'returned') {
      records.value[index].returnDate = todayStr()
      records.value[index].status = 'returned'
      return true
    }
    return false
  }

  function renewBook(id) {
    const index = records.value.findIndex(record => record.id === id)
    if (index !== -1 && records.value[index].status !== 'returned' && records.value[index].renewCount < 2) {
      const newDueDate = new Date(records.value[index].dueDate)
      newDueDate.setDate(newDueDate.getDate() + 15)
      records.value[index].dueDate = formatDate(newDueDate)
      records.value[index].renewCount += 1
      return true
    }
    return false
  }

  // 读者资料（姓名 / 卡号）更新后同步到全部关联借阅记录，
  // 保证借阅详情、列表与读者档案显示一致
  function syncReaderInfo(readerId, info) {
    records.value.forEach(record => {
      if (record.readerId === readerId) {
        if (info.readerName !== undefined) record.readerName = info.readerName
        if (info.cardNo !== undefined) record.cardNo = info.cardNo
      }
    })
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
    getActiveBorrowCount,
    addRecord,
    returnBook,
    renewBook,
    syncReaderInfo,
    searchRecords
  }
})
