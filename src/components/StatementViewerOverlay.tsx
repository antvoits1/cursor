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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 overflow-hidden"
      onClick={() => setViewerDocIndex(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Statement viewer"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setViewerDocIndex(null); }}
        className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 flex items-center justify-center z-[120]"
        aria-label="Close statement viewer"
        title="Close"
      >
        <X size={22} />
      </button>

      {viewerDocIndex > minStmtIndex && (
        <button
          type="button"
          className="fixed left-4 md:left-8 text-white/40 hover:text-white transition-colors z-[110]"
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

      <div
        className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{
          height: 'min(calc(86dvh / var(--ui-scale)), calc((88vw / var(--ui-scale)) * 11 / 8.5))',
          aspectRatio: '8.5 / 11',
          maxWidth: 'calc(88vw / var(--ui-scale))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <StatementDocument index={viewerDocIndex} lead={lead} />
      </div>

      {viewerDocIndex < maxStmtIndex && (
        <button
          type="button"
          className="fixed right-4 md:right-8 text-white/40 hover:text-white transition-colors z-[110]"
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
