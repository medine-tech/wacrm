import { describe, expect, it } from 'vitest';
import {
  mapTwilioContentToRow,
  normalizeTwilioApprovalStatus,
  type TwilioContentItem,
} from './twilio-content-map';

function contentItem(overrides: Partial<TwilioContentItem>): TwilioContentItem {
  return {
    sid: 'HX0000000000000000000000000000001',
    friendly_name: 'order_update',
    language: 'en',
    ...overrides,
  };
}

describe('normalizeTwilioApprovalStatus', () => {
  it('maps the terminal review outcomes', () => {
    expect(normalizeTwilioApprovalStatus('approved')).toBe('APPROVED');
    expect(normalizeTwilioApprovalStatus('rejected')).toBe('REJECTED');
  });
  it('is case-insensitive', () => {
    expect(normalizeTwilioApprovalStatus('APPROVED')).toBe('APPROVED');
  });
  it('maps every in-review / unsubmitted state to PENDING', () => {
    for (const raw of ['received', 'pending', 'draft', 'unsubmitted']) {
      expect(normalizeTwilioApprovalStatus(raw)).toBe('PENDING');
    }
  });
  it('falls back to PENDING for unknown or missing values', () => {
    expect(normalizeTwilioApprovalStatus('paused')).toBe('PENDING');
    expect(normalizeTwilioApprovalStatus('')).toBe('PENDING');
    expect(normalizeTwilioApprovalStatus(undefined)).toBe('PENDING');
  });
});

describe('mapTwilioContentToRow', () => {
  it('maps a twilio/text template', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/text': { body: 'Hello {{1}}, your order shipped.' } },
        approval_requests: { status: 'approved', category: 'UTILITY' },
      }),
    );
    expect(row).toEqual({
      name: 'order_update',
      category: 'Utility',
      language: 'en',
      header_type: null,
      header_media_url: null,
      body_text: 'Hello {{1}}, your order shipped.',
      footer_text: null,
      buttons: null,
      status: 'APPROVED',
      twilio_content_sid: 'HX0000000000000000000000000000001',
      rejection_reason: null,
    });
  });

  it('maps twilio/media to header columns and infers the media kind by extension', () => {
    const image = mapTwilioContentToRow(
      contentItem({
        types: {
          'twilio/media': {
            body: 'See the attached photo',
            media: ['https://cdn.example.com/promo.jpg?x=1'],
          },
        },
      }),
    );
    expect(image.body_text).toBe('See the attached photo');
    expect(image.header_type).toBe('image');
    expect(image.header_media_url).toBe('https://cdn.example.com/promo.jpg?x=1');

    const video = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/media': { media: ['https://cdn.example.com/demo.mp4'] } },
      }),
    );
    expect(video.header_type).toBe('video');

    const document = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/media': { media: ['https://cdn.example.com/invoice.pdf'] } },
      }),
    );
    expect(document.header_type).toBe('document');

    const unknown = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/media': { media: ['https://cdn.example.com/asset'] } },
      }),
    );
    expect(unknown.header_type).toBe('document');
  });

  it('maps twilio/quick-reply actions to QUICK_REPLY buttons and keeps the body', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: {
          'twilio/quick-reply': {
            body: 'Confirm your appointment',
            actions: [
              { title: 'Yes', id: 'yes' },
              { title: 'No', id: 'no' },
              { id: 'no-title-dropped' },
            ],
          },
        },
      }),
    );
    expect(row.body_text).toBe('Confirm your appointment');
    expect(row.buttons).toEqual([
      { type: 'QUICK_REPLY', text: 'Yes' },
      { type: 'QUICK_REPLY', text: 'No' },
    ]);
  });

  it('maps twilio/call-to-action URL and PHONE_NUMBER actions, dropping unknown kinds', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: {
          'twilio/call-to-action': {
            body: 'Need help?',
            actions: [
              { type: 'URL', title: 'Open site', url: 'https://example.com' },
              { type: 'PHONE_NUMBER', title: 'Call us', phone: '+15551234567' },
              { type: 'COPY_CODE', title: 'Copy' },
            ],
          },
        },
      }),
    );
    expect(row.buttons).toEqual([
      { type: 'URL', text: 'Open site', url: 'https://example.com' },
      { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+15551234567' },
    ]);
  });

  it('persists rejection_reason only on REJECTED rows', () => {
    const rejected = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/text': { body: 'hi' } },
        approval_requests: {
          status: 'rejected',
          rejection_reason: 'Promotional content in a utility template',
        },
      }),
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejection_reason).toBe(
      'Promotional content in a utility template',
    );

    const approved = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/text': { body: 'hi' } },
        approval_requests: { status: 'approved', rejection_reason: 'stale' },
      }),
    );
    expect(approved.rejection_reason).toBeNull();
  });

  it('defaults category to Marketing and status to PENDING without an approval request', () => {
    const row = mapTwilioContentToRow(
      contentItem({ types: { 'twilio/text': { body: 'hi' } } }),
    );
    expect(row.category).toBe('Marketing');
    expect(row.status).toBe('PENDING');
  });

  it('maps AUTHENTICATION category through', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/text': { body: '{{1}} is your code' } },
        approval_requests: { status: 'approved', category: 'AUTHENTICATION' },
      }),
    );
    expect(row.category).toBe('Authentication');
  });

  it('falls back to an empty body and the "en" language for sparse items', () => {
    const row = mapTwilioContentToRow(
      contentItem({ language: '', types: undefined }),
    );
    expect(row.body_text).toBe('');
    expect(row.language).toBe('en');
  });

  it('maps whatsapp/card body, footer, media, and mixed actions', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: {
          'whatsapp/card': {
            body: '{{1}}, your order {{2}} shipped',
            footer: 'Reply STOP to opt out',
            media: ['https://example.com/header.png'],
            actions: [
              { type: 'QUICK_REPLY', title: 'Track it', id: 'track' },
              {
                type: 'URL',
                title: 'View order',
                url: 'https://example.com/o/{{2}}',
              },
            ],
          },
        },
        approval_requests: { status: 'approved', category: 'UTILITY' },
      }),
    );
    expect(row.body_text).toBe('{{1}}, your order {{2}} shipped');
    expect(row.footer_text).toBe('Reply STOP to opt out');
    expect(row.header_type).toBe('image');
    expect(row.header_media_url).toBe('https://example.com/header.png');
    expect(row.buttons).toEqual([
      { type: 'QUICK_REPLY', text: 'Track it' },
      { type: 'URL', text: 'View order', url: 'https://example.com/o/{{2}}' },
    ]);
    expect(row.status).toBe('APPROVED');
  });

  it('reads twilio/card title as the body fallback', () => {
    const row = mapTwilioContentToRow(
      contentItem({
        types: { 'twilio/card': { title: 'Card title text' } },
      }),
    );
    expect(row.body_text).toBe('Card title text');
  });
});
