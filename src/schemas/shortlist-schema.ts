/**
 * Shortlist - sites a signed-in user saved from the ranker, plus the
 * AI-drafted proposal for each. Owner-only: members read/edit their own.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const shortlistSchema: CollectionSchema = {
  name: 'shortlist',
  columns: [
    { name: 'siteId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['building', 'lot'] } },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'waterGalPerYear', storage: 'number', interpretation: 'plain' },
    { name: 'solarKwhPerYear', storage: 'number', interpretation: 'plain' },
    { name: 'proposal', storage: 'text', interpretation: 'plain' },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
  ],
  ownerField: 'ownerId',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
