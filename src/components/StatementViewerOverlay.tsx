import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Lead } from '../data';
import StatementDocument from './StatementDocument';

interface StatementViewerOverlayProps {
  lead: Lead;
  viewerDocIndex: number;
  setViewerDocIndex: (index: number | null) => void;
  minStmtIndex: number;
  maxStmtIndex: number;
}

export default function StatementViewerOverlay({ lead, viewerDocIndex, setViewerDocIndex, minStmtIndex, maxStmtIndex }: StatementViewerOverlayProps) {
  return (
    <div
      className="stmt-overlay"
      onClick={() => setViewerDocIndex(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Statement viewer"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setViewerDocIndex(null); }}
        className="stmt-close"
        aria-label="Close statement viewer"
        title="Close"
      >
        <X size={22} />
      </button>

      {viewerDocIndex > minStmtIndex && (
        <button
          type="button"
          className="stmt-nav stmt-nav-prev"
          onClick={(e) => {
            e.stopPropagation();
            setViewerDocIndex(viewerDocIndex === 0 && minStmtIndex === -1 ? -1 : viewerDocIndex - 1);
          }}
          aria-label="View newer statement"
          title="Newer statement"
        >
          <ChevronLeft size={44} strokeWidth={1} />
        </button>
      )}

      <div className="stmt-page" onClick={e => e.stopPropagation()}>
        <StatementDocument index={viewerDocIndex} lead={lead} />
      </div>

      {viewerDocIndex < maxStmtIndex && (
        <button
          type="button"
          className="stmt-nav stmt-nav-next"
          onClick={(e) => {
            e.stopPropagation();
            setViewerDocIndex(viewerDocIndex === -1 ? 0 : viewerDocIndex + 1);
          }}
          aria-label="View older statement"
          title="Older statement"
        >
          <ChevronRight size={44} strokeWidth={1} />
        </button>
      )}
    </div>
  );
}
