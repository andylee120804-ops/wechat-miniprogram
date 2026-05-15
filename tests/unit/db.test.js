/**
 * Unit tests for db.js
 */

// Create mock before requiring db
const dbMock = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ data: [] }),
  add: jest.fn().mockResolvedValue({ _id: 'test-id' }),
  update: jest.fn().mockResolvedValue({ updated: 1 }),
  remove: jest.fn().mockResolvedValue({ removed: 1 }),
  count: jest.fn().mockResolvedValue({ total: 0 }),
  serverDate: jest.fn().mockReturnValue(new Date())
}

const wxMock = {
  cloud: {
    database: jest.fn(() => dbMock)
  }
}

global.wx = wxMock

const db = require('../../miniprogram/utils/db')

describe('db', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    dbMock.get.mockResolvedValue({ data: [] })
    dbMock.count.mockResolvedValue({ total: 0 })
  })

  describe('COLLECTIONS', () => {
    it('should define all collection names', () => {
      expect(db.COLLECTIONS).toHaveProperty('STAFF')
      expect(db.COLLECTIONS).toHaveProperty('RESERVATION')
      expect(db.COLLECTIONS).toHaveProperty('PURCHASE')
      expect(db.COLLECTIONS).toHaveProperty('INCOME')
      expect(db.COLLECTIONS).toHaveProperty('EXPENSE')
    })
  })

  describe('PAGE_SIZE', () => {
    it('should be 20', () => {
      expect(db.PAGE_SIZE).toBe(20)
    })
  })

  describe('getDb', () => {
    it('should return database instance', () => {
      db.getDb()
      expect(wxMock.cloud.database).toHaveBeenCalled()
    })
  })

  describe('queryAll', () => {
    it('should return empty array when count is 0', async () => {
      dbMock.count.mockResolvedValue({ total: 0 })
      const result = await db.queryAll('test')
      expect(result).toEqual({ data: [], total: 0 })
    })

    it('should fetch all records in batches', async () => {
      dbMock.count.mockResolvedValue({ total: 25 })
      dbMock.get
        .mockResolvedValueOnce({ data: Array(20).fill({ _id: 'a' }) })
        .mockResolvedValueOnce({ data: Array(5).fill({ _id: 'b' }) })
      const result = await db.queryAll('test')
      expect(result.data).toHaveLength(25)
    })
  })

  describe('queryPage', () => {
    it('should return paginated results', async () => {
      dbMock.get.mockResolvedValue({ data: [{ _id: '1' }] })
      dbMock.count.mockResolvedValue({ total: 50 })
      const result = await db.queryPage('test', {}, 1, 20)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.hasMore).toBe(true)
    })

    it('should set hasMore to false on last page', async () => {
      dbMock.get.mockResolvedValue({ data: Array(20) })
      dbMock.count.mockResolvedValue({ total: 20 })
      const result = await db.queryPage('test', {}, 1, 20)
      expect(result.hasMore).toBe(false)
    })
  })

  describe('addDoc', () => {
    it('should add document with timestamps', async () => {
      await db.addDoc('test', { name: 'test' })
      expect(dbMock.add).toHaveBeenCalled()
    })
  })

  describe('getDoc', () => {
    it('should return document when found', async () => {
      dbMock.get.mockResolvedValue({ data: { _id: '1', name: 'test' } })
      const result = await db.getDoc('test', '1')
      expect(result).toEqual({ _id: '1', name: 'test' })
    })

    it('should return null when not found', async () => {
      dbMock.get.mockRejectedValue({ errCode: -1 })
      const result = await db.getDoc('test', 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('updateDoc', () => {
    it('should update document', async () => {
      await db.updateDoc('test', '1', { name: 'updated' })
      expect(dbMock.update).toHaveBeenCalled()
    })
  })

  describe('deleteDoc', () => {
    it('should delete document', async () => {
      await db.deleteDoc('test', '1')
      expect(dbMock.doc).toHaveBeenCalledWith('1')
      expect(dbMock.remove).toHaveBeenCalled()
    })
  })
})
