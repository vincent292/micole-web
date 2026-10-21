import { expect, it } from "vitest";
import { ownerPaymentAccess } from "../src/lib/support-access";
import type { Identity } from "../src/lib/types";
const identity: Identity = {
 id:"target-user",name:"Familia",email:"family@example.test",canSupport:true,
 roles:["guardian"],memberships:[{schoolId:"school-one",role:"guardian"}],teacherIds:[],guardianStudentIds:["student-one"],
 support:{id:"session-one",adminId:"owner",role:"guardian",schoolId:"school-one",paymentBypass:true,expiresAt:"2026-10-20T12:00:00Z",reason:"Revisar acceso"},
};
const now = Date.parse("2026-10-20T11:00:00Z");
it("permite revisar la institución de una sesión de propietario verificada",()=>{
 expect(ownerPaymentAccess(identity,"school-one",now)).toBe(true);
 expect(ownerPaymentAccess({...identity,support:{...identity.support!,mode:"test"}},"school-one",now)).toBe(true);
});
it("no confía en un rol, un permiso de soporte solo o una sesión caducada",()=>{
 expect(ownerPaymentAccess({...identity,support:undefined},"school-one",now)).toBe(false);
 expect(ownerPaymentAccess({...identity,canSupport:false},"school-one",now)).toBe(false);
 expect(ownerPaymentAccess({...identity,support:{...identity.support!,paymentBypass:undefined}},"school-one",now)).toBe(false);
 expect(ownerPaymentAccess(identity,"another-school",now)).toBe(false);
 expect(ownerPaymentAccess(identity,"school-one",Date.parse("2026-10-20T13:00:00Z"))).toBe(false);
});
