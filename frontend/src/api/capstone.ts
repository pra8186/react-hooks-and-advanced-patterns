import axios, { type AxiosError } from 'axios'

/** Mirrors capstone `UserTaxOverviewSummaryRow` JSON. */
export interface UserTaxOverviewSummaryRow {
  fullName: string
  primaryState: string
  filingStatus: string
  workStates: string
  taxYear: number
}

/** Mirrors capstone `StateTaxRateThresholdRow` JSON. */
export interface StateTaxRateThresholdRow {
  stateCode: string
  stateName: string
  filingThresholdDays: string
  bracketType: string
  incomeMin: number | string
  incomeMax: number | string
  rate: number | string
}

/** Mirrors capstone `UserTaxOverviewResponse` JSON. */
export interface UserTaxOverviewResponse {
  summary: UserTaxOverviewSummaryRow
  perStateRatesAndThresholds: StateTaxRateThresholdRow[]
}

const client = axios.create({ baseURL: '' })

function messageFromAxiosError(error: AxiosError): string {
  const data = error.response?.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>
    if (typeof rec.message === 'string') return rec.message
    if (typeof rec.error === 'string') {
      const detail = typeof rec.detail === 'string' ? rec.detail : null
      return detail ? `${rec.error}: ${detail}` : rec.error
    }
  }
  return error.message || 'Request failed'
}

export async function fetchUserTaxOverview(userId: string): Promise<UserTaxOverviewResponse> {
  try {
    const { data } = await client.get<UserTaxOverviewResponse>(
      `/api/v1/users/${encodeURIComponent(userId)}/tax-overview`,
    )
    return data
  } catch (e) {
    if (axios.isAxiosError(e)) {
      throw new Error(messageFromAxiosError(e), { cause: e })
    }
    if (e instanceof Error) throw e
    throw new Error('Request failed', { cause: e })
  }
}

/** Same shape Java `UUID.fromString` accepts (hyphenated 32 hex digits), not RFC variant/version bits. */
export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}
