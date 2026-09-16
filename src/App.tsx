import { CommPanel } from './components/comm/CommPanel';
import { CompanyPanel } from './components/company/CompanyPanel';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { LeadsPanel } from './components/leads/LeadsPanel';
import { CrmProvider } from './state/CrmContext';

export function App() {
  return (
    <CrmProvider>
      <div className="app">
        <TopBar />
        <div className="body-area">
          <Sidebar />
          <main className="workspace">
            <div className="crm-panels">
              <LeadsPanel />
              <CompanyPanel />
              <CommPanel />
            </div>
          </main>
        </div>
      </div>
    </CrmProvider>
  );
}
