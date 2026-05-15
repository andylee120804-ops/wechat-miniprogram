/**
 * Unit tests for error-handler.js
 */

// Mock wx before requiring
global.wx = {
  showToast: jest.fn(),
  hideLoading: jest.fn()
}

const errorHandler = require('../../miniprogram/utils/error-handler')

describe('error-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('ERROR_MESSAGES', () => {
    it('should define standard error messages', () => {
      expect(errorHandler.ERROR_MESSAGES).toHaveProperty('-1')
      expect(errorHandler.ERROR_MESSAGES).toHaveProperty('-501001')
      expect(errorHandler.ERROR_MESSAGES).toHaveProperty('-502001')
      expect(errorHandler.ERROR_MESSAGES).toHaveProperty('default')
    })

    it('should map network error', () => {
      expect(errorHandler.ERROR_MESSAGES['-1']).toBe('网络连接失败，请检查网络')
    })

    it('should map database error', () => {
      expect(errorHandler.ERROR_MESSAGES['-501001']).toBe('数据库操作失败')
    })

    it('should map cloud function error', () => {
      expect(errorHandler.ERROR_MESSAGES['-502001']).toBe('云函数调用失败')
    })
  })

  describe('handleCloudError', () => {
    it('should hide loading', () => {
      errorHandler.handleCloudError({ errCode: -1 })
      expect(wx.hideLoading).toHaveBeenCalled()
    })

    it('should show toast with error message', () => {
      errorHandler.handleCloudError({ errCode: -1 })
      expect(wx.showToast).toHaveBeenCalled()
    })

    it('should map network error code', () => {
      errorHandler.handleCloudError({ errCode: -1 })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'none',
          duration: 3000
        })
      )
    })

    it('should map database error code', () => {
      errorHandler.handleCloudError({ errCode: -501001 })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '数据库操作失败'
        })
      )
    })

    it('should map cloud function error code', () => {
      errorHandler.handleCloudError({ errCode: -502001 })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '云函数调用失败'
        })
      )
    })

    it('should use default message for unknown error codes', () => {
      errorHandler.handleCloudError({ errCode: 99999 })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '操作失败，请重试'
        })
      )
    })

    it('should handle string error codes', () => {
      errorHandler.handleCloudError({ code: '-501001' })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '数据库操作失败'
        })
      )
    })

    it('should override for permission errors', () => {
      errorHandler.handleCloudError({ message: 'permission denied' })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '权限不足，无法执行此操作'
        })
      )
    })

    it('should override for network errors in message', () => {
      errorHandler.handleCloudError({ message: 'network connection failed' })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '网络异常，请稍后重试'
        })
      )
    })

    it('should override for timeout errors', () => {
      errorHandler.handleCloudError({ message: 'request timeout' })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '网络异常，请稍后重试'
        })
      )
    })

    it('should override for reservation conflict errors', () => {
      errorHandler.handleCloudError({ message: '该时段已存在预约' })
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '时间冲突，请更换时间或包厢'
        })
      )
    })

    it('should include context in error message', () => {
      errorHandler.handleCloudError({ errCode: -1 }, '添加采购')
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('添加采购')
        })
      )
    })

    it('should handle error with code property', () => {
      errorHandler.handleCloudError({ code: '-1' })
      expect(wx.showToast).toHaveBeenCalled()
    })

    it('should handle empty error object', () => {
      errorHandler.handleCloudError({})
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '操作失败，请重试'
        })
      )
    })
  })
})
