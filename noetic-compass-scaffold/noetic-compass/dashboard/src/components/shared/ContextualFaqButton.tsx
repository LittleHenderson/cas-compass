import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearFaqReturnPoint,
  findFaqTopic,
  matchFaqTopic,
  popFaqScrollRestore,
  queueFaqScrollRestore,
  readFaqReturnPoint,
  writeFaqReturnPoint,
  type FaqReturnPoint,
} from '../../lib/contextualFaq';

const MAIN_SCROLL_ID = 'app-main-scroll';

function currentScrollTop(): number {
  return document.getElementById(MAIN_SCROLL_ID)?.scrollTop ?? window.scrollY ?? 0;
}

function pathWithHash(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function ContextualFaqButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [returnPoint, setReturnPoint] = useState<FaqReturnPoint | null>(() => readFaqReturnPoint());

  const isFaqPage = location.pathname === '/faq';
  const topic = useMemo(() => {
    if (isFaqPage) {
      return findFaqTopic(decodeURIComponent(location.hash.replace(/^#/, ''))) ?? matchFaqTopic(location.pathname);
    }
    return matchFaqTopic(location.pathname);
  }, [isFaqPage, location.hash, location.pathname]);

  useEffect(() => {
    const restoreTop = popFaqScrollRestore();
    if (restoreTop === null) return;

    window.setTimeout(() => {
      const main = document.getElementById(MAIN_SCROLL_ID);
      if (main) {
        main.scrollTo({ top: restoreTop });
      } else {
        window.scrollTo({ top: restoreTop });
      }
    }, 60);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setReturnPoint(readFaqReturnPoint());
  }, [location.pathname, location.search, location.hash]);

  function openFaq() {
    writeFaqReturnPoint({
      path: pathWithHash(location.pathname, location.search, location.hash),
      scrollTop: currentScrollTop(),
      topicId: topic.id,
      topicLabel: topic.label,
    });
    setIsPinned(false);
    navigate(`/faq#${topic.id}`);
  }

  function goBackToSource() {
    if (!returnPoint) return;
    queueFaqScrollRestore(returnPoint.scrollTop);
    clearFaqReturnPoint();
    setReturnPoint(null);
    setIsPinned(false);
    navigate(returnPoint.path);
  }

  const showPanel = isPinned || isHovering;

  if (isFaqPage && returnPoint) {
    return (
      <button
        type="button"
        onClick={goBackToSource}
        className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-[2px] border border-[#37f5a0] bg-[#0c1513] px-4 py-3 text-left font-mono text-xs font-medium text-[#37f5a0] transition-colors hover:bg-[#13201c] sm:right-6"
        title="Return to the exact screen that opened this FAQ"
      >
        ← Back to {returnPoint.topicLabel}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2.5 sm:right-6"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocus={() => setIsHovering(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsHovering(false);
        }
      }}
    >
      {showPanel ? (
        <div className="w-[min(22rem,calc(100vw-2rem))] rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] p-4 text-sm text-[#b3c2ba]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#37f5a0]">
                CAS Compass Help
              </p>
              <p className="mt-1 font-['Space_Grotesk',sans-serif] text-base font-semibold text-[#eaf3ee]">
                {topic.label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPinned(false)}
              className="rounded-[2px] border border-transparent px-2 py-0.5 font-mono text-xs text-[#86958d] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee]"
              aria-label="Close help summary"
            >
              ×
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[#b3c2ba]">{topic.summary}</p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#20302b] pt-3">
            <p className="font-mono text-[10px] text-[#86958d]">Full FAQ returns you here.</p>
            <button
              type="button"
              onClick={openFaq}
              className="shrink-0 rounded-[2px] border border-[#37f5a0] bg-[#13201c] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#37f5a0] transition-colors hover:bg-[#37f5a0] hover:text-[#050b0a]"
            >
              Full FAQ
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (isPinned) {
            openFaq();
          } else {
            setIsPinned(true);
          }
        }}
        onDoubleClick={openFaq}
        className="group flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#20302b] bg-[#0c1513] px-3.5 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
        aria-label="Open contextual FAQ help"
        title="Hover for summary. Click once for help, click again for full FAQ."
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#37f5a0]/50 bg-[#13201c] text-[#37f5a0]">
          ?
        </span>
        <span>Help</span>
      </button>
    </div>
  );
}
