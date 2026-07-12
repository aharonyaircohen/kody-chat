"use client";

import type { ChatPanelViewProps } from "@kody-ade/kody-chat/platform";
import { AgencyStatePage } from "../../../components/AgencyStatePage";

export function FindingsPanelView(_props: ChatPanelViewProps) {
  return <div className="contents" data-testid="chat-panel-findings"><AgencyStatePage view="findings" /></div>;
}
