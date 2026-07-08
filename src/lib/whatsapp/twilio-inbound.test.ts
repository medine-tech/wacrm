import { describe, expect, it } from 'vitest'
import {
  classifyTwilioWebhook,
  mapTwilioInboundContent,
  mapTwilioStatusCallback,
  stripWhatsAppPrefix,
} from './twilio-inbound'

function form(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields)
}

describe('classifyTwilioWebhook', () => {
  it('classifies status callbacks by MessageStatus', () => {
    expect(
      classifyTwilioWebhook(form({ MessageSid: 'SM1', MessageStatus: 'delivered' }))
    ).toBe('status')
  })

  it('classifies reactions by MessageType', () => {
    expect(
      classifyTwilioWebhook(
        form({ MessageSid: 'SM1', MessageType: 'reaction', Body: '👍' })
      )
    ).toBe('reaction')
  })

  it('classifies everything else as an inbound message', () => {
    expect(
      classifyTwilioWebhook(form({ MessageSid: 'SM1', Body: 'hello' }))
    ).toBe('message')
    expect(
      classifyTwilioWebhook(form({ MessageSid: 'SM1', MessageType: 'text' }))
    ).toBe('message')
  })

  it('classifies a real inbound delivery (MessageStatus=received) as a message, not a status callback', () => {
    // Shape observed from live Twilio WhatsApp inbound POSTs: they carry
    // MessageStatus/SmsStatus 'received' alongside the message fields.
    expect(
      classifyTwilioWebhook(
        form({
          MessageSid: 'SM1',
          SmsMessageSid: 'SM1',
          SmsStatus: 'received',
          MessageStatus: 'received',
          MessageType: 'text',
          Body: 'Hola MedineTech',
          From: 'whatsapp:+584163870984',
          To: 'whatsapp:+584248274759',
          NumMedia: '0',
        })
      )
    ).toBe('message')
  })

  it('classifies an inbound reaction carrying MessageStatus=received as a reaction', () => {
    expect(
      classifyTwilioWebhook(
        form({
          MessageSid: 'SM2',
          MessageStatus: 'received',
          MessageType: 'reaction',
          Body: '👍',
        })
      )
    ).toBe('reaction')
  })
})

describe('mapTwilioStatusCallback', () => {
  it('translates the deliverable statuses 1:1', () => {
    for (const status of ['sent', 'delivered', 'read'] as const) {
      expect(
        mapTwilioStatusCallback(form({ MessageSid: 'SM1', MessageStatus: status }))
      ).toEqual({ providerMessageId: 'SM1', status, errorMessage: null })
    }
  })

  it('maps failed and undelivered to failed', () => {
    for (const raw of ['failed', 'undelivered']) {
      expect(
        mapTwilioStatusCallback(form({ MessageSid: 'SM1', MessageStatus: raw }))
      ).toMatchObject({ status: 'failed' })
    }
  })

  it('ignores pre-send lifecycle statuses', () => {
    for (const raw of ['queued', 'accepted', 'sending']) {
      expect(
        mapTwilioStatusCallback(form({ MessageSid: 'SM1', MessageStatus: raw }))
      ).toBeNull()
    }
  })

  it('ignores payloads without a MessageSid', () => {
    expect(mapTwilioStatusCallback(form({ MessageStatus: 'sent' }))).toBeNull()
  })

  it('maps a known ErrorCode to its human hint on failure', () => {
    const update = mapTwilioStatusCallback(
      form({ MessageSid: 'SM1', MessageStatus: 'undelivered', ErrorCode: '63016' })
    )
    expect(update?.status).toBe('failed')
    expect(update?.errorMessage).toContain('24-hour')
    expect(update?.errorMessage).toContain('(Twilio error 63016)')
  })

  it('keeps an unknown ErrorCode visible on failure', () => {
    const update = mapTwilioStatusCallback(
      form({ MessageSid: 'SM1', MessageStatus: 'failed', ErrorCode: '99999' })
    )
    expect(update?.errorMessage).toBe('Twilio error 99999')
  })

  it('carries no error message for successful statuses', () => {
    const update = mapTwilioStatusCallback(
      form({ MessageSid: 'SM1', MessageStatus: 'delivered', ErrorCode: '63016' })
    )
    expect(update?.errorMessage).toBeNull()
  })
})

describe('mapTwilioInboundContent', () => {
  it('maps a plain text message', () => {
    expect(mapTwilioInboundContent(form({ Body: 'hello there' }))).toEqual({
      contentType: 'text',
      contentText: 'hello there',
      interactiveReplyId: null,
      media: null,
      typeLabel: 'text',
    })
  })

  it('maps an image with the Body as caption', () => {
    const content = mapTwilioInboundContent(
      form({
        Body: 'look at this',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/.../Media/ME1',
        MediaContentType0: 'image/jpeg',
      })
    )
    expect(content).toEqual({
      contentType: 'image',
      contentText: 'look at this',
      interactiveReplyId: null,
      media: {
        url: 'https://api.twilio.com/.../Media/ME1',
        contentType: 'image/jpeg',
      },
      typeLabel: 'image',
    })
  })

  it('maps webp stickers to image (Meta sticker parity)', () => {
    expect(
      mapTwilioInboundContent(
        form({
          NumMedia: '1',
          MediaUrl0: 'https://api.twilio.com/m',
          MediaContentType0: 'image/webp',
        })
      )
    ).toMatchObject({ contentType: 'image', contentText: null })
  })

  it('maps video, audio, and everything else to document', () => {
    const cases: Array<[string, string]> = [
      ['video/mp4', 'video'],
      ['audio/ogg', 'audio'],
      ['application/pdf', 'document'],
      ['text/vcard', 'document'],
    ]
    for (const [mime, expected] of cases) {
      expect(
        mapTwilioInboundContent(
          form({
            NumMedia: '1',
            MediaUrl0: 'https://api.twilio.com/m',
            MediaContentType0: mime,
          })
        ).contentType
      ).toBe(expected)
    }
  })

  it('maps a location with label and address (Meta join format)', () => {
    expect(
      mapTwilioInboundContent(
        form({
          Latitude: '10.5',
          Longitude: '-66.9',
          Label: 'Office',
          Address: 'Av. Principal 1',
        })
      )
    ).toMatchObject({
      contentType: 'location',
      contentText: 'Office - Av. Principal 1 - 10.5,-66.9',
      typeLabel: 'location',
    })
  })

  it('maps a bare-coordinates location', () => {
    expect(
      mapTwilioInboundContent(form({ Latitude: '10.5', Longitude: '-66.9' }))
    ).toMatchObject({ contentText: '10.5,-66.9' })
  })

  it('maps a quick-reply button tap to interactive', () => {
    expect(
      mapTwilioInboundContent(
        form({
          Body: 'Yes please',
          ButtonText: 'Yes please',
          ButtonPayload: 'confirm_order',
        })
      )
    ).toEqual({
      contentType: 'interactive',
      contentText: 'Yes please',
      interactiveReplyId: 'confirm_order',
      media: null,
      typeLabel: 'interactive',
    })
  })

  it('falls back to the payload id when ButtonText is missing', () => {
    expect(
      mapTwilioInboundContent(form({ ButtonPayload: 'confirm_order' }))
    ).toMatchObject({ contentText: 'confirm_order' })
  })

  it('maps unknown payloads to a text placeholder', () => {
    expect(
      mapTwilioInboundContent(form({ MessageType: 'contacts' }))
    ).toEqual({
      contentType: 'text',
      contentText: '[Unsupported message type: contacts]',
      interactiveReplyId: null,
      media: null,
      typeLabel: 'contacts',
    })
    expect(mapTwilioInboundContent(form({}))).toMatchObject({
      contentText: '[Unsupported message type: unknown]',
    })
  })
})

describe('stripWhatsAppPrefix', () => {
  it('strips the whatsapp: channel prefix', () => {
    expect(stripWhatsAppPrefix('whatsapp:+584248274759')).toBe('+584248274759')
  })

  it('leaves bare numbers untouched', () => {
    expect(stripWhatsAppPrefix('+584248274759')).toBe('+584248274759')
  })
})
