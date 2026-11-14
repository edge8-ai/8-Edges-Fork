import { describe, expect, it } from 'vitest'
import { RESUME_TYPES, isResumePathFor, isRoleId } from './resume-upload'

const R1 = '7d444840-9dc0-11d1-b245-5ffdce74fad2'
const R2 = '9b2f1c3e-4a5d-4e6f-8a7b-1c2d3e4f5a6b'

describe('isResumePathFor', () => {
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e'
  it('accepts the shape the upload route signs, for the same role only', () => {
    expect(isResumePathFor(R1, `${R1}/${uuid}-cv.pdf`)).toBe(true)
    expect(isResumePathFor(R2, `${R1}/${uuid}-cv.pdf`)).toBe(false)
  })
  it('refuses traversal, nesting and an empty role', () => {
    expect(isResumePathFor(R1, `${R1}/../${R2}/${uuid}-cv.pdf`)).toBe(false)
    expect(isResumePathFor(R1, `${R1}/x/${uuid}-cv.pdf`)).toBe(false)
    expect(isResumePathFor('', `/${uuid}-cv.pdf`)).toBe(false)
  })
  // The role id is the folder, so a role id that is itself a path must never
  // match, whatever the rest of the path looks like.
  it('refuses a role id that is not a uuid', () => {
    expect(isResumePathFor('..', `../${uuid}-cv.pdf`)).toBe(false)
    expect(isResumePathFor('r1', `r1/${uuid}-cv.pdf`)).toBe(false)
  })
})

describe('isRoleId', () => {
  it('accepts a uuid and nothing else', () => {
    expect(isRoleId(R1)).toBe(true)
    expect(isRoleId('')).toBe(false)
    expect(isRoleId('..')).toBe(false)
    expect(isRoleId(`${R1}/..`)).toBe(false)
  })
})

describe('RESUME_TYPES', () => {
  it('holds the PDF and Word types', () => {
    expect(RESUME_TYPES.has('application/pdf')).toBe(true)
    expect(RESUME_TYPES.has('application/msword')).toBe(true)
    expect(RESUME_TYPES.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
  })
  // The type is the applicant's own string; an object map answered truthy for
  // these inherited keys, so they passed both routes.
  it('refuses inherited object keys', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(RESUME_TYPES.has(key)).toBe(false)
    }
  })
})
