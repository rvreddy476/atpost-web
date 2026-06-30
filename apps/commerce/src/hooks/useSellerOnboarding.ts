'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@atpost/api-client'
import type {
  Seller,
  OnboardingStartPayload,
  OnboardingBasicPayload,
  OnboardingStorefrontPayload,
  OnboardingDocumentPayload,
  OnboardingFulfillmentPayload,
  OnboardingPayoutPayload,
} from '@atpost/types/commerce'

const KEY = ['seller', 'onboarding']

export function useOnboardingStatus() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get<{ data: Seller }>('/v1/commerce/onboarding/status')
      return res.data.data
    },
    retry: false,
  })
}

export function useStartOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OnboardingStartPayload) => {
      const res = await api.post<{ data: Seller }>('/v1/commerce/onboarding/start', payload)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSaveBasicInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OnboardingBasicPayload) => {
      await api.put('/v1/commerce/onboarding/step/basic', payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSaveStorefront() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OnboardingStorefrontPayload) => {
      await api.put('/v1/commerce/onboarding/step/storefront', payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSaveDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documents: OnboardingDocumentPayload[]) => {
      await api.put('/v1/commerce/onboarding/step/documents', { documents })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSaveFulfillment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OnboardingFulfillmentPayload) => {
      await api.put('/v1/commerce/onboarding/step/fulfillment', payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSavePayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OnboardingPayoutPayload) => {
      await api.put('/v1/commerce/onboarding/step/payout', payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSubmitApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { message: string } }>('/v1/commerce/onboarding/submit')
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
