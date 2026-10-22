import { describe, expect, it, vi } from "vitest";
import { createRefreshQueue } from "../src/lib/refreshQueue";
import { realtimeCollections } from "../src/lib/realtime";
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => {resolve=r;}); return {promise, resolve}; }
describe("workspace realtime refresh coordination", () => {
 it("coalesces a transaction burst and does not query the entire workspace for a message", async () => {
  const load=vi.fn(async (_items?: string[]) => {}), refresh=createRefreshQueue(load);
  await Promise.all([refresh(["messages"]),refresh(["notifications"]),refresh(["messages"])]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(load.mock.calls[0][0]).toEqual(["messages","notifications"]);
  expect(realtimeCollections(["messages"])).toEqual(expect.arrayContaining(["messages","notifications"]));
  expect(realtimeCollections(["messages"])).not.toContain("students");
 });
 it("serializes concurrent partials so a later response cannot discard an earlier table", async () => {
  const first=gate(), second=gate(), applied:string[]=[];
  const load=vi.fn(async (items?:string[]) => { if(load.mock.calls.length===1)await first.promise;else await second.promise; applied.push(...items!); });
  const refresh=createRefreshQueue(load),a=refresh(["messages"]);await tick();
  const b=refresh(["announcements"]),c=refresh(["events"]);await tick();
  expect(load).toHaveBeenCalledTimes(1);first.resolve();await a;await tick();
  expect(load.mock.calls[1][0]).toEqual(["announcements","events"]);
  second.resolve();await Promise.all([b,c]);expect(applied).toEqual(["messages","announcements","events"]);
 });
 it("a reconnect/access refresh dominates pending partials", async () => {
  const load=vi.fn(async (_items?:string[])=>{}),refresh=createRefreshQueue(load);
  await Promise.all([refresh(["messages"]),refresh(),refresh(["events"])]);
  expect(load).toHaveBeenCalledExactlyOnceWith(undefined);
  for(const table of ["school_memberships","student_guardians","school_charges","school_payments","platform_charges","students","unknown_future_table"])
   expect(realtimeCollections([table])).toBeUndefined();
 });
 it("feature-only events do not reload unrelated collections", async () => {
  const load=vi.fn(async()=>{}),refresh=createRefreshQueue(load);
  const own=realtimeCollections(["staff_attendance_records","assessment_scores","bank_qr_intents"]);
  expect(own).toEqual([]);await refresh(own);expect(load).not.toHaveBeenCalled();
 });
 it("an unsuccessful batch rejects its callers but later changes can still synchronize", async () => {
  const load=vi.fn(async (_items?:string[])=>{}).mockRejectedValueOnce(new Error("network"));const refresh=createRefreshQueue(load);
  await expect(refresh(["messages"])).rejects.toThrow("network");
  await expect(refresh(["events"])).resolves.toBeUndefined();expect(load).toHaveBeenCalledTimes(2);
 });
});
