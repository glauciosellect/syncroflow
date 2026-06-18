interface FacebookLoginResponse {
  authResponse?: {
    code?: string
    accessToken?: string
  }
  status?: string
}

interface FacebookLoginOptions {
  config_id?: string
  response_type?: string
  override_default_response_type?: boolean
  extras?: Record<string, unknown>
}

interface FacebookSDK {
  init: (params: { appId: string; xfbml?: boolean; version: string }) => void
  login: (callback: (response: FacebookLoginResponse) => void, options?: FacebookLoginOptions) => void
}

declare global {
  interface Window {
    FB: FacebookSDK
    fbAsyncInit: () => void
  }
}

export {}
