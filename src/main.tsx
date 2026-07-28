import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AuthProvider } from '@/lib/auth'
import { queryClient, queryPersister } from '@/lib/queryClient'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastHost } from '@/components/ToastHost'
import { ThemeProvider, initTheme } from '@/lib/theme'
import { App } from '@/App'
import './index.css'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24,
        buster: 'randall-finance-v2',
      }}
    >
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ErrorBoundary>
              <App />
              <ToastHost />
            </ErrorBoundary>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
