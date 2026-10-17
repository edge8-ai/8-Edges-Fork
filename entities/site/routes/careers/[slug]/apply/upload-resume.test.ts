import { describe, expect, it } from 'vitest'
import { typed } from './upload-resume'

// M1.1: Android pickers report a CV's type as empty or as octet-stream, and the
// form must still accept a PDF or Word file by its name.
describe('typed', () => {
  const pdf = 'application/pdf'
  const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  it('reads the type from the extension when the picker gave none', () => {
    expect(typed(new File(['cv'], 'cv.docx', { type: '' })).type).toBe(docx)
  })

  it('reads the type from the extension when the picker said octet-stream', () => {
    expect(typed(new File(['cv'], 'My CV.PDF', { type: 'application/octet-stream' })).type).toBe(pdf)
    expect(typed(new File(['cv'], 'cv.doc', { type: 'application/octet-stream' })).type).toBe('application/msword')
  })

  it('keeps a type that is already accepted, whatever the name says', () => {
    const file = new File(['cv'], 'cv.doc', { type: pdf })
    expect(typed(file)).toBe(file)
  })

  it('leaves a file with no resume extension as it came, for the form to refuse', () => {
    const heic = new File(['img'], 'scan.heic', { type: 'image/heic' })
    expect(typed(heic)).toBe(heic)
    const bare = new File(['x'], 'resume', { type: 'application/octet-stream' })
    expect(typed(bare)).toBe(bare)
  })
})
