import { describe, expect, it } from 'vitest'

import { buildPushPayload } from './route'

describe('buildPushPayload', () => {
  it('deep-links to the conversation and coalesces by conversation tag', () => {
    const payload = buildPushPayload({
      id: 'n-1',
      user_id: 'u-1',
      title: 'Ada replied',
      body: 'When can we ship?',
      conversation_id: 'c-42',
    })

    expect(payload).toEqual({
      title: 'Ada replied',
      body: 'When can we ship?',
      url: '/inbox?c=c-42',
      tag: 'conversation:c-42',
    })
  })

  it('falls back to the notifications list when there is no conversation', () => {
    const payload = buildPushPayload({
      id: 'n-2',
      user_id: 'u-1',
      title: 'System notice',
      body: null,
      conversation_id: null,
    })

    expect(payload).toEqual({
      title: 'System notice',
      body: '',
      url: '/notifications',
      tag: 'notification:n-2',
    })
  })
})
