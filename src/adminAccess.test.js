import { describe, expect, it } from 'vitest'
import { isAdminRoleAllowed } from './adminAccess'

describe('isAdminRoleAllowed', () => {
  it('allows admin accounts only', () => {
    expect(isAdminRoleAllowed('admin')).toBe(true)
    expect(isAdminRoleAllowed('recruiter')).toBe(false)
    expect(isAdminRoleAllowed('job_seeker')).toBe(false)
  })
})
