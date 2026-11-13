import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ApiRequestError } from './api/client';
import { Layout } from './components/Layout';
import { Alerts } from './pages/Alerts';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { StockDetail } from './pages/StockDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Client errors (bad symbol, validation) will not fix themselves — only retry the rest.
      retry: (count, err) =>
        !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="stock/:symbol" element={<StockDetail />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
