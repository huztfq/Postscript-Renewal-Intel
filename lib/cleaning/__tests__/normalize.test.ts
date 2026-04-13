import { describe, it, expect } from 'vitest'
import { resolveAccount } from '../normalize'

describe('resolveAccount', () => {
  it('resolves dusk.com to DUSK', () => {
    const acc = resolveAccount('DUSK', 'dusk.com', 'http://www.linkedin.com/company/dusk-australasia', 'Charlie Webber', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('dusk')
    expect(acc.name).toBe('DUSK')
    expect(acc.quarantine).toBe(false)
  })

  it('resolves duskofficial.com to same DUSK account', () => {
    const acc = resolveAccount('DUSK', 'duskofficial.com', '', 'System Connector', '', 'Prospect')
    expect(acc.normalized_name).toBe('dusk')
  })

  it('resolves rhodeskin.com to rhode skin', () => {
    const acc = resolveAccount('rhode', 'rhodeskin.com', 'http://www.linkedin.com/company/rhodeskin', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('rhode-skin')
    expect(acc.name).toBe('rhode skin')
  })

  it('resolves shoprhode.com to Rhode Resort', () => {
    const acc = resolveAccount('Rhode', 'shoprhode.com', 'https://www.linkedin.com/company/rhode-resort', 'System Connector', '', 'Prospect')
    expect(acc.normalized_name).toBe('rhode-resort')
    expect(acc.name).toBe('Rhode Resort')
  })

  it('quarantines rhode.pro', () => {
    const acc = resolveAccount('Rhode', 'rhode.pro', '', '', '', 'Prospect')
    expect(acc.quarantine).toBe(true)
  })

  it('resolves eatfishwife.com to Fishwife', () => {
    const acc = resolveAccount('Fishwife', 'eatfishwife.com', '', 'Ryan Shea', 'Coleman Meier', 'Onboarding')
    expect(acc.normalized_name).toBe('fishwife')
  })

  it('resolves shop.ruggable.com to Ruggable', () => {
    const acc = resolveAccount('Ruggable', 'shop.ruggable.com', '', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('ruggable')
  })

  it('resolves thrivecausemetics.com to Thrive Causemetics', () => {
    const acc = resolveAccount('Thrive Causemetics', 'thrivecausemetics.com', '', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('thrive-causemetics')
  })
})
