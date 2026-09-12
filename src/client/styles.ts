/**
 * DSH-native styles for the session-resilience settings card.
 *
 * The card uses the same semantic tokens and compact spacing as the DSH
 * settings surfaces, while its module rail and numbered control groups give
 * the plugin a distinct identity without introducing a second visual system.
 */

const css = `
.dshAcCard {
  list-style: none;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  transition: border-color .16s, background .16s;
}
.dshAcCard:hover,
.dshAcCardOpen {
  border-color: var(--dsw-alias-label-dimmed);
}
.dshAcCardOpen { background: var(--dsw-alias-bg-layer-2); }
.dshAcHeaderFrame { display: flex; flex-direction: column; }
.dshAcModuleBar {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 30px;
  padding: 8px 16px 7px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  display: flex;
}
.dshAcModuleCode {
  overflow: hidden;
  color: var(--dsw-alias-label-caption);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .08em;
  line-height: 1.4;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.dshAcStatus {
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.4;
  display: inline-flex;
}
.dshAcStatusReady { color: var(--dsw-alias-state-business-primary); }
.dshAcStatusDot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}
.dshAcHeader {
  width: 100%;
  appearance: none;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  display: flex;
}
.dshAcHeader:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshAcModuleGlyph {
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-brand-primary);
  display: grid;
}
.dshAcModuleGlyphBars {
  height: 18px;
  align-items: flex-end;
  gap: 3px;
  display: flex;
}
.dshAcModuleGlyphBars span {
  width: 3px;
  height: 10px;
  border-radius: 3px;
  background: currentColor;
}
.dshAcModuleGlyphBars span:nth-child(2) { height: 16px; opacity: .8; }
.dshAcModuleGlyphBars span:nth-child(3) { height: 13px; opacity: .55; }
.dshAcHeadText {
  min-width: 0;
  flex: 1;
  gap: 3px;
  display: flex;
  flex-direction: column;
}
.dshAcName {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshAcDescription {
  max-width: 660px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.dshAcHeaderMeta {
  align-items: stretch;
  gap: 14px;
  flex: none;
  display: flex;
}
.dshAcReadout {
  min-width: 82px;
  gap: 2px;
  padding-left: 12px;
  border-left: 0.5px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
}
.dshAcReadoutLabel {
  overflow: hidden;
  color: var(--dsw-alias-label-caption);
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshAcReadout strong {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshAcPending {
  flex: none;
  align-self: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.45;
  white-space: nowrap;
}
.dshAcChevron {
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s, color .16s;
  display: grid;
  place-items: center;
}
.dshAcChevron svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.dshAcHeader:hover .dshAcChevron { color: var(--dsw-alias-label-primary); }
.dshAcChevronOpen { transform: rotate(180deg); }
.dshAcBody {
  margin: 0 16px;
  padding-bottom: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dshAcReadOnly {
  margin: 12px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.dshAcFormCanvas { display: flex; flex-direction: column; }
.dshAcFormSection {
  overflow: hidden;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dshAcFormSection:first-child { border-top: 0; }
.dshAcSectionHead {
  align-items: flex-start;
  gap: 12px;
  padding: 18px 0 12px;
  display: flex;
}
.dshAcSectionIndex {
  width: 28px;
  flex: none;
  color: var(--dsw-alias-label-caption);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  line-height: 1.5;
}
.dshAcSectionIndex::after {
  width: 16px;
  height: 1px;
  margin-top: 8px;
  background: var(--dsw-alias-border-l2);
  content: '';
  display: block;
}
.dshAcSectionCopy { min-width: 0; gap: 2px; display: flex; flex-direction: column; }
.dshAcSectionTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}
.dshAcSectionDescription {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11.5px;
  line-height: 1.45;
}
.dshAcSectionGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 22px;
  padding-bottom: 4px;
}
.dshAcField {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, .82fr);
  grid-template-areas: 'head control' 'hint control';
  align-items: start;
  column-gap: 16px;
  padding: 13px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dshAcSectionGrid > .dshAcField:nth-child(-n + 2) { border-top: 0; }
.dshAcFieldWide { grid-column: 1 / -1; }
.dshAcHead { grid-area: head; min-width: 0; align-items: flex-start; gap: 8px; display: flex; }
.dshAcLabel { min-width: 0; flex: 1; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; line-height: 1.5; }
.dshAcBadges { align-items: center; gap: 8px; display: inline-flex; }
.dshAcBadge { padding: 1px 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5; white-space: nowrap; }
.dshAcReset { border: 0; background: none; padding: 0; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; line-height: 1.5; cursor: pointer; }
.dshAcReset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshAcReset:disabled { cursor: default; }
.dshAcInput,
.dshAcSelect {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  grid-area: control;
  align-self: start;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}
.dshAcInput { padding: 0 10px; }
.dshAcSelect { padding: 0 8px; }
.dshAcInput:focus-visible,
.dshAcSelect:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dshAcInput:disabled,
.dshAcSelect:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dshAcInputInvalid { border-color: var(--dsw-alias-state-error-primary); }
.dshAcTextArea { min-height: 84px; padding: 8px 10px; resize: vertical; }
.dshAcHint,
.dshAcInvalid {
  grid-area: hint;
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
}
.dshAcHint { color: var(--dsw-alias-label-tertiary); }
.dshAcInvalid { color: var(--dsw-alias-state-error-primary); }
.dshAcFooter {
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 0 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  display: flex;
}
.dshAcFailed { min-width: 0; flex: 1; margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5; }
.dshAcDiscard,
.dshAcSave { border-radius: 8px; padding: 5px 14px; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer; }
.dshAcDiscard { border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }
.dshAcSave { border: 0.5px solid var(--dsw-alias-label-primary); background: var(--dsw-alias-label-primary); color: var(--dsw-alias-label-primary-inverted); }
.dshAcDiscard:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshAcSave:hover:not(:disabled) { opacity: .86; }
.dshAcDiscard:disabled,
.dshAcSave:disabled { opacity: .4; cursor: default; }
.dshAcDiscard:focus-visible,
.dshAcSave:focus-visible,
.dshAcReset:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshAcPanel { min-width: 0; padding: 14px 0 16px; display: flex; flex-direction: column; gap: 8px; }
.dshAcPanel + .dshAcPanel { padding-left: 18px; border-left: 0.5px solid var(--dsw-alias-border-l2); }
.dshAcPanelHead { align-items: center; gap: 8px; display: flex; }
.dshAcPanelTitle { min-width: 0; flex: 1; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; line-height: 1.5; }
.dshAcStats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 16px; margin: 0; }
.dshAcStats > div { justify-content: space-between; gap: 8px; display: flex; }
.dshAcStats dt { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dshAcStats dd { margin: 0; color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; line-height: 1.5; }
.dshAcCodes { flex-wrap: wrap; align-items: center; gap: 6px; display: flex; }
.dshAcCode { padding: 1px 7px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; white-space: nowrap; }
.dshAcPauseList { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; list-style: none; }
.dshAcPauseList li { align-items: center; gap: 8px; display: flex; }
.dshAcPauseId { min-width: 0; flex: 1; overflow: hidden; color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 820px) {
  .dshAcHeaderMeta { display: none; }
  .dshAcSectionGrid { grid-template-columns: minmax(0, 1fr); }
  .dshAcSectionGrid > .dshAcField:nth-child(2) { border-top: 0.5px solid var(--dsw-alias-border-l2); }
  .dshAcPanel + .dshAcPanel { padding-left: 0; border-top: 0.5px solid var(--dsw-alias-border-l2); border-left: 0; }
}
@media (max-width: 560px) {
  .dshAcModuleBar { padding-right: 13px; padding-left: 13px; }
  .dshAcHeader { align-items: flex-start; padding: 14px 13px; }
  .dshAcModuleGlyph { width: 30px; height: 30px; }
  .dshAcName { font-size: 14px; }
  .dshAcDescription { font-size: 11.5px; }
  .dshAcPending { display: none; }
  .dshAcBody { margin-right: 13px; margin-left: 13px; }
  .dshAcField { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'head' 'control' 'hint'; row-gap: 6px; }
  .dshAcSectionGrid > .dshAcField:nth-child(2) { border-top: 0.5px solid var(--dsw-alias-border-l2); }
}
@media (prefers-reduced-motion: reduce) {
  .dshAcCard, .dshAcChevron { transition: none; }
}
`;

/** Inject the stylesheet once; a no-op outside a browser environment. */
export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="dsh-session-resilience/card"]') !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-session-resilience';
  tag.dataset.pluginCss = 'dsh-session-resilience/card';
  tag.textContent = css;
  document.head.appendChild(tag);
}
