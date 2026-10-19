import { platformBalance } from "../lib/pricing";
import { uploadPickupIdentity } from "./PickupIdentity";
import {usePlatformTariffs} from './Pricing';
import { BankQrDialog } from "./BankQr";
import {subjectName,subjectOptions} from "../lib/learning";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Copy, Link, LockKeyhole, ReceiptText } from "lucide-react";
import { CareFields, readCareProfile } from "../components/CareFields";
import { Button, Field, Modal, FormSection } from "../components/UI";
import { bolivianCities, monthCount } from "../lib/operations";
import { shiftMonth } from "../components/MonthCalendar";
import { buildSchedule, today } from "../lib/billing";
import { initials, money, uid } from "../lib/store";
import { rpc } from "../lib/repository";
import { liveMode, supabase } from "../lib/supabase";
import {
  readInstitutionIdentity,
  validateInstitutionLogoUrl,
  validateInstitutionLogoFile,
} from "../lib/institutionIdentity";
import type { PaymentPlan, School, Student } from "../lib/types";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
const titles: Record<string, string> = {
  school: "Una nueva institución",
  branding: "La identidad de tu colegio",
  student: "Ficha de inscripción",
  profile: "Su ficha de cuidado",
  teacher: "Equipo docente",
  classroom: "Un aula para aprender",
  charge: "Agregar un cobro",
  plan: "Plan de pagos",
  planDiscount: "Ajustar descuento del plan",
  announcement: "Un mensaje para la comunidad",
  entry: "Hoy en el cuaderno",
  event: "Una fecha para compartir",
  materials: "Lista de materiales",
  grade: "Nota y recomendación",
  absence: "Solicitud de ausencia",
  pickup: "Autorizar una recogida",
  requestResponse: "Revisar solicitud",
  invite: "Invitar a la familia",
  directorInvite: "Invitar a dirección",
  teacherInvite: "Invitar a una docente",
  payment: "Registrar un pago escolar",
  platformPayment: "Registrar un pago de plataforma",
  platformInvoice: "Liquidación de licencias",
  invoice: "Solicitar factura",
  qr: "Pago con QR",
  status: "Estado de la inscripción",
  access: "Plazo de acceso al cuaderno",
  reset: "Restaurar modo local",
};
const values = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form).entries());

function InstitutionIdentityFields({ institution }: { institution?: School }) {
  const [contact, setContact] = useState({ directorIdentity: institution?.directorIdentity || "", directorPhone: institution?.directorPhone || "" });
  const [contactReady, setContactReady] = useState(!liveMode || !institution?.id);
  const [contactError, setContactError] = useState("");
  useEffect(() => {
    let active = true;
    if (!liveMode || !institution?.id) return;
    void rpc<typeof contact>("institution_private_contact", { p_school_id: institution.id })
      .then(value => { if (active) { setContact(value); setContactReady(true); } })
      .catch(() => { if (active) setContactError("No pudimos cargar los datos privados de Dirección. Cierra y vuelve a abrir el formulario para reintentar."); });
    return () => { active = false; };
  }, [institution?.id]);
  const [logoUrl, setLogoUrl] = useState(
    /^https:\/\//i.test(institution?.logoUrl || "") ? institution!.logoUrl! : "",
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [fileError, setFileError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!logoFile) {
      setFilePreview("");
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  let remotePreview = "";
  try {
    remotePreview = validateInstitutionLogoUrl(logoUrl.trim());
  } catch {
    // El campo muestra su validación al guardar; la vista previa usa solo HTTPS.
  }
  const savedFile = institution?.logoUrl?.startsWith("data:image/")
    ? institution.logoUrl
    : "";
  const preview = removeLogo
    ? ""
    : filePreview || remotePreview || savedFile;
  useEffect(() => setPreviewFailed(false), [preview]);

  return (
    <>
      <FormSection title="Logo y portada">
      <div className="institution-logo-preview" aria-live="polite">
        {preview && !previewFailed ? (
          <img
            src={preview}
            alt="Vista previa del logo de la institución"
            referrerPolicy="no-referrer"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <span className="school-symbol large" style={{ background: institution?.color || "#3D6EF7" }}>
            {institution?.initials || "MC"}
          </span>
        )}
        <div>
          <strong>{removeLogo ? "Usaremos las iniciales" : "Logo de la institución"}</strong>
          <small>
            {previewFailed
              ? "No pudimos cargar la vista previa. Revisa la dirección del logo."
              : "PNG, JPG o WebP hasta 10 MB. Se convierte a WebP y se ajusta hasta 512 × 512 px."}
          </small>
        </div>
      </div>
      <Field label="Logo · dirección HTTPS" name="logoUrl">
        <input
          type="url"
          name="logoUrl"
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://…"
          maxLength={2048}
          disabled={removeLogo}
        />
      </Field>
      <Field label="O subir logo · se optimiza a WebP" name="logoFile">
        <input
          type="file"
          name="logoFile"
          accept="image/png,image/jpeg,image/webp"
          disabled={removeLogo}
          aria-describedby="institution-logo-help"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setFileError("");
            if (!file) {
              setLogoFile(null);
              return;
            }
            try {
              validateInstitutionLogoFile(file);
              setLogoFile(file);
            } catch (error) {
              setLogoFile(null);
              event.target.value = "";
              setFileError(error instanceof Error ? error.message : "Revisa el archivo del logo.");
            }
          }}
        />
      </Field>
      <p className="institution-field-help" id="institution-logo-help">
        Si eliges un archivo, lo usaremos en lugar del enlace.
      </p>
      {fileError && <div className="message error" role="alert">{fileError}</div>}
      <label className="institution-check">
        <input
          type="checkbox"
          name="removeLogo"
          checked={removeLogo}
          onChange={(event) => setRemoveLogo(event.target.checked)}
        />
        <span>Quitar logo y usar las iniciales</span>
      </label>
      <Field label="Banner de la institución" name="bannerFile"><input type="file" name="bannerFile" accept="image/png,image/jpeg,image/webp" /></Field>
      <p className="muted">Se convierte a WebP y se ajusta hasta 1400 × 700 px.</p>
      {institution?.bannerUrl && <img className="institution-banner-preview" src={institution.bannerUrl} alt="Portada actual" />}
      <label className="check-field"><input type="checkbox" name="removeBanner" /> Quitar banner</label>
      </FormSection>
      <FormSection title="Contacto y ubicación">
      <div className="form-grid">
        <Field label="NIT (opcional)" name="nit">
          <input
            name="nit"
            inputMode="numeric"
            pattern="[0-9]{1,20}"
            maxLength={20}
            defaultValue={institution?.nit || ""}
            placeholder="Solo números"
          />
        </Field>
        <Field label="Teléfono de la institución" name="phone">
          <input type="tel" name="phone" maxLength={40} defaultValue={institution?.phone || ""} />
        </Field>
      </div>
      <Field label="Dirección de la institución" name="address">
        <textarea name="address" rows={2} maxLength={500} defaultValue={institution?.address || ""} placeholder="Zona, calle y número" />
      </Field>
      <Field label="Sitio web (opcional)" name="website">
        <input type="url" name="website" maxLength={2048} defaultValue={institution?.website || ""} placeholder="https://…" />
      </Field>

      <Field label="Ubicación en Google Maps" name="mapsUrl">
        <textarea name="mapsUrl" rows={2} maxLength={4500} defaultValue={institution?.mapsUrl || ""} placeholder="Pega el enlace de Google Maps o Compartir → Insertar un mapa" />
      </Field>
      </FormSection>
      <FormSection title="Dirección y publicación">
      <input type="hidden" name="privateContactReady" value={String(contactReady)} />
      <fieldset disabled={!contactReady} className="form-grid">
        <Field label="Carnet de Dirección" name="directorIdentity"><input name="directorIdentity" maxLength={40} required={!institution} value={contact.directorIdentity} onChange={e => setContact({ ...contact, directorIdentity: e.target.value })} /></Field>
        <Field label="Celular de Dirección" name="directorPhone"><input type="tel" name="directorPhone" maxLength={25} required={!institution} value={contact.directorPhone} onChange={e => setContact({ ...contact, directorPhone: e.target.value })} /></Field>
      </fieldset>
      {contactError && <p className="message error" role="alert">{contactError}</p>}
      <p className="muted">El carnet y celular de Dirección no se publican en la landing ni se entregan a las familias.</p>
      <div className="institution-visibility">
        <label className="institution-check">
          <input type="checkbox" name="showOnLanding" defaultChecked={institution?.showOnLanding !== false} aria-describedby="institution-visibility-help" />
          <span><strong>Mostrar institución en la página de MiCole</strong></span>
        </label>
        <p id="institution-visibility-help" className="institution-visibility-help">
          El nombre, logo, ciudad y sitio web se muestran cuando la institución está activa.
        </p>
      </div>
      </FormSection>
    </>
  );
}

export function WorkspaceModal({
  type,
  id,
  store,
  school,
  role,
  students,
  student,
  identity,
  onClose,
  onSuccess,
}: PageProps & {
  type: string;
  id?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [admissionRoomId, setAdmissionRoomId] = useState(id ? store.data.students.find(s => s.id === id)?.classroomId || "" : "");
  const [gradeStudentId,setGradeStudentId]=useState(student?.id||students[0]?.id||"");
  const [planStudentId, setPlanStudentId] = useState(student?.id || "");
  const [error, setError] = useState(""),
    [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickupRequestId,setPickupRequestId]=useState(()=>uid());
  const [pickupFile,setPickupFile]=useState<File|null>(null);
  const [pickupAsset,setPickupAsset]=useState<{id:string;localUrl?:string}|null>(null);
  const needsTariffs=type==="plan"||(type==="student"&&!id);
  const tariffs=usePlatformTariffs(school?.id,needsTariffs);
  const frozenData = useRef(store.data);
  const data = frozenData.current;
  const admissionSettings=data.operationSettings.find(s=>s.schoolId===school?.id);
  const needsMother=admissionSettings?.familyPolicy!=="father",needsFather=admissionSettings?.familyPolicy!=="mother";
  const editStudent = data.students.find((s) => s.id === id);
  const editTeacher = data.teachers.find((t) => t.id === id);
  const editClassroom = data.classrooms.find((c) => c.id === id);
  const editEvent = data.events.find((e) => e.id === id);
  const editSchool = data.schools.find((s) => s.id === id) || school;
  const charge = (
    type === "platformPayment"
      ? data.platformCharges
      : type === "qr"
        ? [...data.charges, ...data.platformCharges]
        : data.charges
  ).find((c) => c.id === id);
  const editPlan = data.paymentPlans.find((p) => p.id === id);
  const request = data.requests.find((r) => r.id === id);
  const rooms = data.classrooms.filter(
    (c) =>
      c.schoolId === school?.id &&
      (role !== "teacher" ||
        c.teacherIds.some((t) => identity.teacherIds.includes(t))),
  );
  const teachers = data.teachers.filter((t) => t.schoolId === school?.id);
  const target = editStudent || student;
  const studentSelect = (defaultId?: string) => (
    <Field label="Estudiante" name="studentId" required>
      <select
        name="studentId"
        required
        defaultValue={defaultId || student?.id || ""}
      >
        <option value="" disabled>
          Seleccionar estudiante
        </option>
        {students.map((s) => (
          <option value={s.id} key={s.id}>
            {fullName(s)}
          </option>
        ))}
      </select>
    </Field>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || store.busy) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const f = Object.fromEntries(formData.entries()),
      val = (key: string) => String(f[key] || "").trim(),
      num = (key: string) => Number(val(key)) || 0;
    const schoolId = school?.id || "";
    const createdAt = today();
    setSubmitting(true);
    setError("");
    try {
      if (type === "school" || type === "branding") {
        if (type === "branding" && !editSchool)
          throw new Error("Selecciona una institución.");
        if (liveMode) {
          if (!supabase) throw new Error("La conexión de MiCole no está configurada.");
          // An older save_school RPC would silently discard the new identity fields.
          const { error: schemaError } = await supabase.from("schools")
            .select("nit,address,website,show_on_landing").limit(0);
          if (schemaError) {
            if (["42703", "PGRST204"].includes(schemaError.code))
              throw new Error("La identidad institucional requiere una actualización de MiCole. Tus datos no se han guardado; puedes conservar este formulario y reintentar cuando se aplique.");
            throw new Error("No pudimos comprobar la configuración institucional. Intenta guardar nuevamente.");
          }
        }
        const institutionIdentity = await readInstitutionIdentity(
          formData,
          type === "branding" ? editSchool?.logoUrl : "",
          type === "branding" ? editSchool?.bannerUrl : "",
        );
        const name = val("name");
        const newId = type === "branding" ? editSchool!.id : uid();
        await store.save("schools", type === "branding" ? {
          ...editSchool!,
          ...institutionIdentity,
          name,
          city: val("city"),
          director: role === "superadmin" ? val("director") : editSchool!.director,
          color: val("color"),
          initials: initials(name),
        } : {
          id: newId,
          ...institutionIdentity,
          name,
          slug: `${name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 90)
            .replace(/-$/, "")}-${newId.slice(0, 8)}`,
          initials: initials(name),
          city: val("city"),
          director: val("director"),
          color: val("color"),
          status: "pending",
          createdAt,
        });
      }
      if (type === "student") {
        const item: Student = {
          ...editStudent,
          id: id || uid(),
          schoolId,
          firstName: val("firstName"),
          lastName: val("lastName"),
          birthDate: val("birthDate"),
          classroomId: val("classroomId"),
          guardianName: val("motherName")||val("fatherName"),
          guardianEmail: (val("motherEmail")||val("fatherEmail")).toLowerCase(),
          motherName: val("motherName"),
          motherEmail: val("motherEmail").toLowerCase(),
          motherPhone: val("motherPhone"),
          fatherName: val("fatherName"),
          fatherEmail: val("fatherEmail").toLowerCase(),
          fatherPhone: val("fatherPhone"),
          rude: val("rude").toUpperCase(),
          identityNumber: val("identityNumber").toUpperCase(),
          allergies: val("allergies"),
          monthlyFee: num("monthlyFee"),
          snackFee: num("snackFee"),
          enrollmentFee: num("enrollmentFee"),
          enrolledAt: editStudent?.enrolledAt || createdAt,
          status: editStudent?.status || "pending",
        };
        if(!id)Object.assign(item,{activationFeeQuote:tariffs.rates.activationFee});
        if (id) await store.save("students", item);
        else await store.enroll(item, {
          licenseFee: tariffs.rates.monthlyLicenseFee,
          id: uid(), schoolId, studentId: item.id, startDate: val("startDate"), months: num("months"),
          monthlyFee: item.monthlyFee, snackFee: item.snackFee || 0, enrollmentFee: item.enrollmentFee || 0,
          dueDay: num("dueDay"), discount: num("discount"), discountFrom: val("discountFrom"), discountTo: val("discountTo"), prorate: f.prorate === "on", createdAt,
        });
      }
      if (type === "profile") {
        if (!target) throw new Error("Selecciona un estudiante.");
        await store.completeCare(target, readCareProfile(e.currentTarget));
      }
      if (type === "teacher") {
        const teacher = {
          ...editTeacher,
          id: id || uid(),
          schoolId,
          name: val("name"),
          email: val("email").toLowerCase(),
          specialty: val("specialty"),
          status: val("status") as "active" | "pending" | "inactive",
        };
        const assigned = formData.getAll("classroomIds").map(String);
        if (!assigned.length) throw new Error("Selecciona al menos un aula para el docente.");
        if (liveMode) { await rpc("save_teacher_with_classrooms", { p_teacher: { id: teacher.id, school_id: teacher.schoolId, name: teacher.name, email: teacher.email, specialty: teacher.specialty, status: teacher.status }, p_classroom_ids: assigned }); await store.refresh(); }
        else { await store.save("teachers", teacher); for (const room of rooms) if (assigned.includes(room.id)) await store.save("classrooms", { ...room, teacherIds: [...new Set([...room.teacherIds, teacher.id])] }); }
      }
      if (type === "classroom")
        await store.save("classrooms", {
          id: id || uid(),
          schoolId,
          name: val("name"),
          level: val("level"),
          schedule: `${val("startTime")} – ${val("endTime")}`,
          startTime: val("startTime"), endTime: val("endTime"),
          weekdays: formData.getAll("weekdays").map(Number),
          capacity: num("capacity"), monthlyFee: num("classroomMonthlyFee"), academicYear: num("academicYear"), active: f.classroomActive === "on",
          teacherIds: formData
            .getAll("teacherIds")
            .map(String),
        });
      if (type === "charge")
        await store.save("charges", {
          id: uid(),
          schoolId,
          studentId: val("studentId"),
          concept: val("concept"),
          amount: num("amount"),
          dueDate: val("dueDate"),
          status: "pending",
        });
      if (type === "plan")
        await store.createPlan({
          licenseFee: tariffs.rates.monthlyLicenseFee,
          id: uid(),
          schoolId,
          studentId: val("studentId"),
          startDate: val("startDate"),
          months: num("months"),
          monthlyFee: num("monthlyFee"),
          snackFee: num("snackFee"),
          enrollmentFee: num("enrollmentFee"),
          dueDay: num("dueDay"),
          discount: num("discount"),
          discountFrom: val("discountFrom"),
          discountTo: val("discountTo"),
          prorate: f.prorate === "on",
          createdAt,
        });
      if (type === "planDiscount" && editPlan)
        await store.adjustDiscount(
          editPlan,
          num("discount"),
          val("discountFrom"),
          val("discountTo"),
        );
      if (type === "announcement")
        await store.save("announcements", {
          id: uid(),
          schoolId,
          title: val("title"),
          content: val("content"),
          classroomId: val("classroomId"),
          audience: val("audience") as "all" | "staff" | "families",
          createdAt,
        });
      if (type === "entry" && val("studentId").startsWith("class:"))
        await store.publishClassEntry(
          schoolId,
          val("studentId").split(":")[1],
          val("category"),
          val("note"),
          val("date"),
        );
      else if (type === "entry")
        await store.save("dailyEntries", {
          id: uid(),
          schoolId,
          studentId: val("studentId"),
          category: val("category") as "actividad",
          note: val("note"),
          date: val("date"),
        });
      if (type === "event" || type === "materials")
        await store.save("events", {
          id: id || uid(),
          schoolId,
          classroomId: val("classroomId"),
          title: val("title"),
          description: val("description"),
          date: val("date"),
          type:
            type === "materials"
              ? "materials"
              : (val("eventType") as "event" | "homework"),
        });
      if (type === "grade")
        await store.save("grades", {
          id: uid(),
          schoolId,
          studentId: val("studentId"),
          classSubjectId: val("classSubjectId") || undefined,
          subject: val("classSubjectId") ? subjectName(data,val("classSubjectId")) : val("subject"),
          period: val("period"),
          score: val("score"),
          recommendation: val("recommendation"),
          createdAt,
        });
      if (type === "absence" || type === "pickup") {
        if (!student) throw new Error("Selecciona un hijo.");
        let asset=pickupAsset;
        if(type==="pickup"&&!asset){if(!pickupFile)throw new Error("Adjunta la foto del carnet de quien recogerá al niño.");asset=await uploadPickupIdentity(pickupRequestId,student.id,pickupFile);setPickupAsset(asset);}
        await store.save("requests", {
          id: type==="pickup"?pickupRequestId:uid(),
          pickupFileId: asset?.id,
          pickupFileUrl: asset?.localUrl,
          schoolId,
          studentId: student.id,
          type: type === "absence" ? "absence" : "pickup",
          date: val("date"),
          reason: val("reason"),
          pickupName: val("pickupName"),
          pickupId: val("pickupId"),
          vehiclePlate: val("vehiclePlate"),
          status: "pending",
          response: "",
          createdAt,
        });
      }
      if (type === "requestResponse" && request)
        await store.save("requests", {
          ...request,
          status: val("status") as "approved" | "rejected",
          response: val("response"),
        });
      if (
        type === "invite" ||
        type === "directorInvite" ||
        type === "teacherInvite"
      ) {
        const email = val("email").toLowerCase();
        const inviteSchoolId =
          type === "directorInvite" ? val("schoolId") : schoolId;
        const next = await store.invite({
          id: uid(),
          schoolId: inviteSchoolId,
          studentId: type === "invite" ? val("studentId") : undefined,
          teacherId: type === "teacherInvite" ? editTeacher?.id : undefined,
          email,
          role:
            type === "directorInvite"
              ? "director"
              : type === "teacherInvite"
                ? "teacher"
                : "guardian",
          relationship: val("relationship") || "other",
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          status: "pending",
        });
        setLink(next);
        return;
      }
      if (type === "payment" || type === "platformPayment") {
        if (!charge) throw new Error("No se encontró el cobro.");
        await store.recordPayment(
          charge.id,
          type === "platformPayment",
          val("method"),
          val("reference"),
        );
      }
      if (type === "platformInvoice")
        await store.invoicePlatform(val("schoolId"), val("period"));
      if (type === "invoice") {
        if (!charge || !("dueDate" in charge))
          throw new Error("No se encontró la cuota.");
        const patch = {
          invoiceName: val("invoiceName"),
          invoiceNit: val("invoiceNit"),
          invoicePhone: val("invoicePhone"),
        };
        if (liveMode) {
          await rpc("request_invoice", {
            p_charge_id: charge.id,
            p_details: patch,
          });
          await store.refresh();
        } else await store.save("charges", { ...charge, ...patch });
      }
      if (type === "access") {
        if (!editStudent) throw new Error("Selecciona un estudiante.");
        await store.grantAccess(editStudent, val("accessUntil"));
      }
      if (type === "status") {
        if (!editStudent) throw new Error("Selecciona un estudiante.");
        const action = val("action");
        if (action === "access") {
          await store.save("students", {
            ...editStudent,
            accessUntil: val("accessUntil"),
          });
        } else
          await store.studentStatus(
            editStudent,
            action === "inactive" ? "inactive" : "active",
            val("withdrawalReason"),
          );
      }
      if (type === "reset") store.reset();
      onSuccess(
        type === "student" && !id
          ? tariffs.rates.activationFee>0?`Inscripción creada. Activación de ${money(tariffs.rates.activationFee)} pendiente; ya puedes invitar a la familia.`:"Inscripción creada sin cobro de activación. Ya puedes completar la ficha familiar."
          : type === "invoice"
            ? "Solicitud de factura guardada para la institución."
            : "Cambios guardados correctamente.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos guardar. Inténtalo de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (type === "qr") return <BankQrDialog request={charge?{kind:data.platformCharges.some(c=>c.id===charge.id)?"platform":"school",schoolId:charge.schoolId,studentId:"studentId" in charge?charge.studentId:undefined,items:[{chargeId:charge.id,amount:"dueDate" in charge?charge.amount:platformBalance(charge)}]}:undefined} onClose={onClose} onChanged={()=>void store.refresh()}/>;
  if (link)
    return (
      <Modal
        title="Invitación lista para compartir"
        onClose={onClose}
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
        submitLabel="Listo"
      >
        <span className="row-icon">
          <Link size={24} />
        </span>
        <p>
          Comparte este enlace con la persona invitada. Debe ingresar con el
          correo indicado; caduca en 7 días.
        </p>
        <input
          className="copy-link"
          readOnly
          value={link}
          aria-label="Enlace de invitación"
        />
        <Button
          variant="secondary"
          icon={Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setError("Enlace copiado.");
            } catch {
              setError("Selecciona y copia el enlace de arriba.");
            }
          }}
        >
          Copiar enlace
        </Button>
        {!liveMode && (
          <div className="message warn">
            Invitación de prueba: activa Supabase para aceptar este enlace con
            Google. No se envió ningún correo.
          </div>
        )}
        {error && <p role="status">{error}</p>}
      </Modal>
    );
  return (
    <Modal
      title={titles[type] || "Guardar registro"}
      subtitle={
        type === "student"
          ? "Una inscripción pendiente genera la activación de MiCole según la tarifa vigente."
          : "Cada detalle nos ayuda a estar más cerca."
      }
      onClose={onClose}
      onSubmit={submit}
      error={error|| (needsTariffs?tariffs.error:"")}
      busy={submitting || store.busy}
      submitDisabled={needsTariffs&&!tariffs.ready}
      submitLabel={
        type.includes("Invite") || type === "invite"
          ? "Crear enlace"
          : type === "reset"
            ? "Restaurar datos"
            : "Guardar"
      }
    >
      {(type === "school" || type === "branding") && (
        <>
          <FormSection title="Datos generales">
          <Field
            label="Nombre de la institución"
            name="name"
            required
            defaultValue={type === "branding" ? editSchool?.name : ""}
          />
          <div className="form-grid">
            <Field label="Ciudad" name="city" required>
              <select name="city" required defaultValue={type === "branding" ? editSchool?.city || "" : ""}>
                <option value="" disabled>Seleccionar ciudad</option>
                {type === "branding" && editSchool?.city && !bolivianCities.includes(editSchool.city) && <option>{editSchool.city}</option>}
                {bolivianCities.map(city => <option key={city}>{city}</option>)}
              </select>
            </Field>
            <Field
              label="Color de marca"
              name="color"
              type="color"
              defaultValue={type === "branding" ? editSchool?.color || "#3D6EF7" : "#3D6EF7"}
            />
          </div>
          {type === "school" || role === "superadmin" ? (
            <Field label="Nombre de la directora" name="director" required defaultValue={type === "branding" ? editSchool?.director : ""} />
          ) : (
            <p className="institution-field-help">Dirección: {editSchool?.director}</p>
          )}
          </FormSection>
          <InstitutionIdentityFields institution={type === "branding" ? editSchool : undefined} />
        </>
      )}
      {type === "student" && (
        <>
          <FormSection title="Estudiante">
          <div className="form-grid">
            <Field
              label="Nombres"
              name="firstName"
              required
              defaultValue={editStudent?.firstName}
            />
            <Field
              label="Apellidos"
              name="lastName"
              required
              defaultValue={editStudent?.lastName}
            />
            <Field
              label="Fecha de nacimiento"
              name="birthDate"
              type="date"
              required
              max={today()}
              defaultValue={editStudent?.birthDate}
            />
            <Field label="Aula" name="classroomId" required>
              <select
                name="classroomId"
                required
                value={admissionRoomId} onChange={e => setAdmissionRoomId(e.target.value)}
              >
                <option value="" disabled>
                  Seleccionar aula
                </option>
                {rooms.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field
              label="RUDE (opcional)"
              name="rude"
              defaultValue={editStudent?.rude}
            />
            <Field
              label="Número de CI del niño"
              name="identityNumber"
              required={admissionSettings?.childCiRequired!==false}
              defaultValue={editStudent?.identityNumber}
            />
          </div>
          </FormSection>
          <FormSection title="Madre y padre">
          <div className="form-section-label">MADRE · ACCESO A MICOLE</div>
          <Field
            label="Nombre completo de la madre"
            name="motherName"
            required={needsMother}
            defaultValue={editStudent?.motherName || (!editStudent?.fatherEmail ? editStudent?.guardianName : "")}
          />
          <div className="form-grid">
            <Field
              label="Correo de la madre"
              name="motherEmail"
              type="email"
              required={needsMother}
              defaultValue={
                editStudent?.motherEmail || (!editStudent?.fatherEmail ? editStudent?.guardianEmail : "")
              }
            />
            <Field
              label="Teléfono de la madre"
              name="motherPhone"
              type="tel"
              defaultValue={editStudent?.motherPhone}
            />
          </div>
          <div className="form-section-label">PADRE · ACCESO A MICOLE</div>
          <Field
            label="Nombre completo del padre"
            name="fatherName"
            required={needsFather}
            defaultValue={editStudent?.fatherName}
          />
          <div className="form-grid">
            <Field
              label="Correo del padre"
              name="fatherEmail"
              type="email"
              required={needsFather}
              defaultValue={editStudent?.fatherEmail}
            />
            <Field
              label="Teléfono del padre"
              name="fatherPhone"
              type="tel"
              defaultValue={editStudent?.fatherPhone}
            />
          </div>
          <Field
            label="Alergias conocidas"
            name="allergies"
            defaultValue={editStudent?.allergies}
            placeholder="Escribe ninguna si no tiene"
          />
          </FormSection>
          <FormSection title="Plan de pagos">
          {id&&<p className="soft-note">Los precios editados se usarán en nuevas emisiones. Las cuotas ya creadas conservan su importe.</p>}
          {id ? <div className="form-grid"><Field label="Mensualidad fija" name="monthlyFee" type="number" min={0} step="0.01" required defaultValue={editStudent?.monthlyFee || 0} /><Field label="Merienda mensual" name="snackFee" type="number" min={0} step="0.01" defaultValue={editStudent?.snackFee || 0} /><Field label="Matrícula (0 si no aplica)" name="enrollmentFee" type="number" min={0} step="0.01" defaultValue={editStudent?.enrollmentFee || 0} /></div>
          : <PlanFields licenseFee={tariffs.rates.monthlyLicenseFee} key={admissionRoomId} student={{ monthlyFee: rooms.find(r => r.id === admissionRoomId)?.monthlyFee || 0 } as Student} schoolId={school?.id || ""} />}
          <div className="soft-note">
            La licencia mensual de MiCole está incluida en las cuotas del plan. Puedes
            compartir la ficha familiar por WhatsApp después de guardar. Madre y
            padre encontrarán a sus hijos al ingresar con los correos
            registrados.
          </div>
          </FormSection>
        </>
      )}
      {type === "profile" && (
        <>
          <p>
            Información de {fullName(target)}. Usa “ninguna” si no tiene
            alergias o restricciones.
          </p>
          <CareFields value={target} />
        </>
      )}
      {type === "teacher" && (
        <>
          <Field
            label="Nombre completo"
            name="name"
            required
            defaultValue={editTeacher?.name}
          />
          <Field
            label="Correo Google"
            name="email"
            type="email"
            required
            defaultValue={editTeacher?.email}
          />
          <Field
            label="Especialidad"
            name="specialty"
            required
            defaultValue={editTeacher?.specialty}
          />
          <Field label="Estado" name="status">
            <select
              name="status"
              defaultValue={editTeacher?.status || "pending"}
            >
              <option value="pending">Pendiente de invitar</option>
              <option value="active">Activa</option>
              <option value="inactive">De baja</option>
            </select>
          </Field>
        </>
      )}
      {type === "teacher" && <Field label="Aulas asignadas" name="classroomIds"><div className="checkbox-list">{rooms.map(room => <label key={room.id}><input type="checkbox" name="classroomIds" value={room.id} defaultChecked={!!editTeacher && room.teacherIds.includes(editTeacher.id)} />{room.name}</label>)}</div>{!rooms.length && <p className="message warn">Primero crea un aula desde Aulas y cursos.</p>}</Field>}
      {type === "classroom" && (
        <>
          <Field
            label="Nombre del aula"
            name="name"
            required
            defaultValue={editClassroom?.name}
          />
          <div className="form-grid">
            <Field
              label="Nivel"
              name="level"
              required
              defaultValue={editClassroom?.level}
            />
          </div>
          <div className="form-grid">
            <Field label="Hora de inicio" name="startTime" required><select name="startTime" required defaultValue={editClassroom?.startTime?.slice(0,5) || "08:00"}>{Array.from({length:96},(_,i) => `${String(Math.floor(i/4)).padStart(2,"0")}:${String(i%4*15).padStart(2,"0")}`).map(time => <option key={time}>{time}</option>)}</select></Field>
            <Field label="Hora de salida" name="endTime" required><select name="endTime" required defaultValue={editClassroom?.endTime?.slice(0,5) || "12:00"}>{Array.from({length:96},(_,i) => `${String(Math.floor(i/4)).padStart(2,"0")}:${String(i%4*15).padStart(2,"0")}`).map(time => <option key={time}>{time}</option>)}</select></Field>
            <Field label="Gestión" name="academicYear" required><select name="academicYear" defaultValue={editClassroom?.academicYear || Number(today().slice(0,4))}>{Array.from({length:6},(_,i)=>Number(today().slice(0,4))-1+i).map(year=><option key={year}>{year}</option>)}</select></Field>
            <Field label="Mensualidad base del aula · Bs" name="classroomMonthlyFee" type="number" min={0} step="0.01" defaultValue={editClassroom?.monthlyFee || 0} />
            <Field label="Cupos del aula" name="capacity" type="number" min={1} max={500} required defaultValue={editClassroom?.capacity || 30} />
          </div>
          <Field label="Días de clase" name="weekdays"><div className="weekday-options">{["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((day,i)=><label key={day}><input type="checkbox" name="weekdays" value={i+1} defaultChecked={(editClassroom?.weekdays || [1,2,3,4,5]).includes(i+1)} />{day}</label>)}</div></Field>
          <label className="check-field"><input type="checkbox" name="classroomActive" defaultChecked={editClassroom?.active !== false} /> Admitir inscripciones en esta aula</label>
          <Field label="Docentes asignadas" name="teacherIds">
            <div className="checkbox-list">
              {teachers.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    name="teacherIds"
                    value={t.id}
                    defaultChecked={editClassroom?.teacherIds.includes(t.id)}
                  />
                  <span>
                    {t.name}
                    <small>{t.specialty}</small>
                  </span>
                </label>
              ))}
              {!teachers.length && (
                <p className="muted">
                  Agrega docentes antes de asignarlas a un aula.
                </p>
              )}
            </div>
          </Field>
        </>
      )}
      {type === "charge" && (
        <>
          {studentSelect()}
          <Field
            label="Concepto"
            name="concept"
            required
            placeholder="Matrícula, material, actividad…"
          />
          <div className="form-grid">
            <Field
              label="Importe · Bs"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
            <Field
              label="Vencimiento"
              name="dueDate"
              type="date"
              required
              defaultValue={today()}
            />
          </div>
        </>
      )}
      {type === "plan" && (
        <>
          <Field label="Estudiante" name="studentId" required>
            <select
              required
              name="studentId"
              value={planStudentId}
              onChange={(e) => setPlanStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </Field>
          <PlanFields licenseFee={tariffs.rates.monthlyLicenseFee}
            key={planStudentId}
            student={students.find((s) => s.id === planStudentId)}
            schoolId={school?.id || ""}
          />
        </>
      )}
      {type === "planDiscount" && (
        <>
          <Field
            label="Descuento por cuota · Bs (0 para deshabilitar)"
            name="discount"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={editPlan?.discount || 0}
          />
          <div className="form-grid">
            <Field
              label="Vigente desde"
              name="discountFrom"
              type="date"
              defaultValue={editPlan?.discountFrom}
            />
            <Field
              label="Vigente hasta"
              name="discountTo"
              type="date"
              defaultValue={editPlan?.discountTo}
            />
          </div>
          <div className="soft-note">
            El descuento se usará en nuevas emisiones según sus fechas. Todas las cuotas ya creadas conservan su importe y descuento original.
          </div>
        </>
      )}
      {type === "announcement" && (
        <>
          <Field label="Título" name="title" required />
          <Field label="Aula destinataria" name="classroomId">
            <select
              name="classroomId"
              defaultValue={role === "teacher" ? rooms[0]?.id : ""}
            >
              {role !== "teacher" && (
                <option value="">Toda la institución</option>
              )}
              {rooms.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Para quién" name="audience">
            <select name="audience">
              <option value="all">Toda la comunidad</option>
              <option value="families">Familias</option>
              <option value="staff">Equipo docente</option>
            </select>
          </Field>
          <Field label="Comunicado" name="content">
            <textarea name="content" rows={5} required maxLength={10000} />
          </Field>
        </>
      )}
      {type === "entry" && (
        <>
          <Field label="Estudiante o aula" name="studentId">
            <select name="studentId" required defaultValue={student?.id}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
              {rooms.map((c) => (
                <option key={c.id} value={`class:${c.id}`}>
                  Toda el aula · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field
              label="Fecha"
              name="date"
              type="date"
              required
              defaultValue={today()}
            />
            <Field label="Categoría" name="category">
              <select name="category">
                {[
                  "actividad",
                  "alimentación",
                  "descanso",
                  "observación",
                  "tarea",
                ].map((c) => (
                  <option value={c} key={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="¿Qué pasó hoy?" name="note">
            <textarea name="note" required rows={4} maxLength={5000} />
          </Field>
        </>
      )}
      {(type === "event" || type === "materials") && (
        <>
          <Field
            label={type === "materials" ? "Nombre de la lista" : "Título"}
            name="title"
            required
            defaultValue={editEvent?.title}
          />
          <div className="form-grid">
            <Field
              label="Fecha"
              name="date"
              type="date"
              required
              defaultValue={editEvent?.date || today()}
            />
            <Field label="Aula" name="classroomId">
              <select
                name="classroomId"
                defaultValue={
                  editEvent?.classroomId ||
                  (role === "teacher" ? rooms[0]?.id : "")
                }
              >
                {role !== "teacher" && (
                  <option value="">Toda la institución</option>
                )}
                {rooms.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {type === "event" && (
            <Field label="Tipo" name="eventType">
              <select
                name="eventType"
                defaultValue={editEvent?.type || "event"}
              >
                <option value="event">Evento</option>
                <option value="homework">Tarea</option>
              </select>
            </Field>
          )}
          <Field
            label={
              type === "materials"
                ? "Materiales · uno por línea"
                : "Descripción"
            }
            name="description"
          >
            <textarea
              name="description"
              required
              rows={5}
              defaultValue={editEvent?.description}
            />
          </Field>
        </>
      )}
      {type === "grade" && (
        <>
          <Field label="Estudiante" name="studentId" required><select name="studentId" required value={gradeStudentId} onChange={e=>setGradeStudentId(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></Field>
          <div className="form-grid">
            {data.classrooms.find(r=>r.id===students.find(s=>s.id===gradeStudentId)?.classroomId)?.subjectsEnabled ?
             <Field label="Materia" name="classSubjectId" required><select key={gradeStudentId} name="classSubjectId" required defaultValue=""><option value="" disabled>Selecciona una materia</option>{subjectOptions(data,students.find(s=>s.id===gradeStudentId)?.classroomId||'',identity,role).map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>:
             <Field label="Materia" name="subject" required defaultValue="Desarrollo integral"/>}
            <Field
              label="Período"
              name="period"
              required
              placeholder="Primer trimestre"
            />
          </div>
          <Field
            label="Nota o valoración"
            name="score"
            required
            placeholder="90/100 o Logro destacado"
          />
          <Field label="Recomendación" name="recommendation">
            <textarea name="recommendation" required rows={4} />
          </Field>
        </>
      )}
      {(type === "absence" || type === "pickup") && (
        <>
          <p>{fullName(student)}</p>
          <Field
            label="Fecha"
            name="date"
            type="date"
            required
            min={today()}
            defaultValue={today()}
          />
          <Field label="Motivo o mensaje" name="reason">
            <textarea name="reason" required rows={3} />
          </Field>
          {type === "pickup" && (
            <>
              <Field label="Foto del carnet de quien recogerá" name="pickupIdentityPhoto"><input name="pickupIdentityPhoto" type="file" accept="image/jpeg,image/png,image/webp" required onChange={e=>{setPickupFile(e.target.files?.[0]||null);setPickupAsset(null);setPickupRequestId(uid());}}/></Field><p className="muted">Adjunta el anverso legible, con foto, nombre y CI. Solo la familia y el personal autorizado podrán consultarlo.</p>
              <Field
                label="Nombre de quien recogerá"
                name="pickupName"
                required
              />
              <div className="form-grid">
                <Field
                  label="Documento de identidad"
                  name="pickupId"
                  required
                />
                <Field
                  label="Placa del vehículo (opcional)"
                  name="vehiclePlate"
                />
              </div>
            </>
          )}
        </>
      )}
      {type === "requestResponse" && (
        <>
          <p>{request?.reason}</p>
          <Field label="Respuesta" name="status">
            <select name="status">
              <option value="approved">Aprobar</option>
              <option value="rejected">Rechazar</option>
            </select>
          </Field>
          <Field label="Mensaje para la familia" name="response">
            <textarea name="response" required rows={3} />
          </Field>
        </>
      )}
      {["invite", "directorInvite", "teacherInvite"].includes(type) && (
        <>
          {type === "invite" && studentSelect(id)}
          {type === "directorInvite" && (
            <Field label="Institución" name="schoolId">
              <select name="schoolId" required defaultValue={editSchool?.id}>
                {data.schools.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label="Correo de la persona"
            name="email"
            type="email"
            required
            defaultValue={
              type === "teacherInvite"
                ? editTeacher?.email
                : type === "invite"
                  ? editStudent?.guardianEmail
                  : ""
            }
          />
          {type === "invite" && (
            <Field label="Relación" name="relationship">
              <select name="relationship">
                <option value="mother">Madre</option>
                <option value="father">Padre</option>
              </select>
            </Field>
          )}
          <div className="soft-note">
            <LockKeyhole size={17} />
            El enlace solo puede aceptarlo el correo indicado. Puedes crear
            varias invitaciones para un mismo niño.
          </div>
        </>
      )}
      {(type === "payment" || type === "platformPayment") && (
        <>
          <div className="payment-summary">
            <ReceiptText size={30} />
            <h3>{charge?.concept}</h3>
            <strong>{money(charge?.amount || 0)}</strong>
          </div>
          <Field label="Medio de pago" name="method">
            <select name="method">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </Field>
          <Field
            label="Referencia o comprobante"
            name="reference"
            required
            placeholder="Número de recibo o transacción"
          />
          <div className="soft-note">
            Registra un pago que ya hayas recibido. Los pagos QR se verificarán
            mediante el proveedor bancario.
          </div>
        </>
      )}
      {type === "platformInvoice" && (
        <>
          <Field label="Institución" name="schoolId">
            <select name="schoolId" required defaultValue={school?.id}>
              {data.schools.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Período"
            name="period"
            type="month"
            required
            defaultValue={today().slice(0, 7)}
          />
          <div className="soft-note">
            Se usa la tarifa vigente por estudiante activo al momento de generar. El
            mismo período no se puede liquidar dos veces.
          </div>
        </>
      )}
      {type === "invoice" && (
        <>
          <Field
            label="Razón social o nombre"
            name="invoiceName"
            required
            defaultValue={
              charge && "invoiceName" in charge ? charge.invoiceName : ""
            }
          />
          <Field
            label="NIT / CI"
            name="invoiceNit"
            required
            defaultValue={
              charge && "invoiceNit" in charge ? charge.invoiceNit : ""
            }
          />
          <Field
            label="Número de celular"
            name="invoicePhone"
            type="tel"
            required
            defaultValue={
              charge && "invoicePhone" in charge ? charge.invoicePhone : ""
            }
          />
          <p className="muted">
            La institución recibe estos datos para emitir la factura. La emisión
            SIAT todavía requiere una integración.
          </p>
        </>
      )}
      {type === "access" && (
        <>
          <p>{fullName(editStudent)}</p>
          <Field
            label="Autorizar acceso hasta"
            name="accessUntil"
            required
            type="date"
            min={today()}
            defaultValue={editStudent?.accessUntil}
          />
          <div className="soft-note">
            Permite revisar la agenda temporalmente aunque exista deuda. No
            modifica el saldo ni permite saltarse la activación inicial de MiCole.
          </div>
        </>
      )}
      {type === "status" && (
        <>
          {editStudent?.status === "active" && <Field label="Motivo de la baja" name="withdrawalReason" required><textarea name="withdrawalReason" required minLength={5} maxLength={1000} rows={3} /></Field>}
          <p>{fullName(editStudent)}</p>
          <Field label="Acción" name="action">
            <select
              name="action"
              defaultValue={
                editStudent?.status === "active" ? "inactive" : "active"
              }
            >
              <option value="active">Activar inscripción</option>
              <option value="inactive">Dar de baja</option>
              <option value="access">Conceder acceso temporal por deuda</option>
            </select>
          </Field>
          <Field
            label="Acceso temporal hasta (si corresponde)"
            name="accessUntil"
            type="date"
            min={today()}
            defaultValue={editStudent?.accessUntil}
          />
          <div className="soft-note">
            La baja cancela las cuotas futuras no pagadas; las deudas vencidas
            permanecen. La activación requiere confirmar el cobro inicial de MiCole. El acceso temporal no elimina la deuda.
          </div>
        </>
      )}
      {type === "reset" && (
        <p>
          Se reemplazarán los registros locales por los ejemplos iniciales.
          Puedes exportarlos desde Configuración antes de continuar.
        </p>
      )}
    </Modal>
  );
}
function PlanFields({
  student,
  schoolId,
  licenseFee=29,
}: {
  student?: Student;
  schoolId: string;
  licenseFee?: number;
}) {
  const initial: PaymentPlan = {
    id: "preview",
    licenseFee,
    schoolId,
    studentId: student?.id || "",
    startDate: today(),
    months: 10,
    monthlyFee: student?.monthlyFee ?? 0,
    snackFee: student?.snackFee || 0,
    enrollmentFee: student?.enrollmentFee || 0,
    dueDay: 10,
    discount: 0,
    discountFrom: "",
    discountTo: "",
    prorate: false,
    createdAt: today(),
  };
  const [preview, setPreview] = useState(initial);
  const [rangeEnd, setRangeEnd] = useState(shiftMonth(initial.startDate.slice(0,7), 9));
  let charges: ReturnType<typeof buildSchedule> = [];
  let invalid = "";
  try {
    charges = buildSchedule({...preview,licenseFee}, () => "preview");
  } catch (e) {
    invalid = e instanceof Error ? e.message : "";
  }
  return (
    <div
      className="plan-fields"
      onChange={(e) => {
        const form = (e.target as HTMLElement).closest("form");
        if (!form) return;
        const f = values(form);
        const n = (key: string) => Number(f[key] || 0);
        const startDate = String(f.startDate || "");
        const field = (e.target as HTMLInputElement).name;
        const months = field === "endMonth" ? monthCount(startDate.slice(0,7), String(f.endMonth)) : n("months");
        if (field === "months" || field === "startDate") setRangeEnd(shiftMonth(startDate.slice(0,7), months-1));
        setPreview({
          ...initial,
          startDate,
          months,
          monthlyFee: n("monthlyFee"),
          snackFee: n("snackFee"),
          enrollmentFee: n("enrollmentFee"),
          dueDay: n("dueDay"),
          discount: n("discount"),
          discountFrom: String(f.discountFrom || ""),
          discountTo: String(f.discountTo || ""),
          prorate: f.prorate === "on",
        });
      }}
    >
      <div className="form-grid">
        <Field
          label="Fecha de inicio"
          name="startDate"
          type="date"
          required
          defaultValue={initial.startDate}
        />
        <Field label="Hasta qué mes" name="endMonth" required><input name="endMonth" type="month" required min={preview.startDate.slice(0,7)} max={shiftMonth(preview.startDate.slice(0,7),35)} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></Field>
        <Field label="Cuotas mensuales" name="months" required><select name="months" value={preview.months} onChange={() => {}}>{Array.from({length:36},(_,i)=><option key={i+1} value={i+1}>{i+1} {i===0 ? "cuota" : "cuotas"}</option>)}</select></Field>
        <Field
          label="Mensualidad fija · Bs"
          name="monthlyFee"
          type="number"
          required
          min={0}
          step="0.01"
          defaultValue={initial.monthlyFee}
        />
        <Field
          label="Merienda mensual · Bs"
          name="snackFee"
          type="number"
          min={0}
          step="0.01"
          defaultValue={initial.snackFee}
        />
        <Field
          label="Matrícula · Bs (0 si no aplica)"
          name="enrollmentFee"
          type="number"
          min={0}
          step="0.01"
          defaultValue={initial.enrollmentFee}
        />
        <Field
          label="Día de vencimiento"
          name="dueDay"
          type="number"
          required
          min={1}
          max={28}
          defaultValue={10}
        />
      </div>
      <label className="check-field">
        <input name="prorate" type="checkbox" /> Prorratear el primer mes desde
        la fecha de ingreso
      </label>
      <div className="form-section-label">DESCUENTO OPCIONAL</div>
      <Field
        label="Descuento por cuota · Bs"
        name="discount"
        type="number"
        min={0}
        step="0.01"
        defaultValue={0}
      />
      <div className="form-grid">
        <Field label="Vigente desde" name="discountFrom" type="date" />
        <Field label="Vigente hasta" name="discountTo" type="date" />
      </div>
      <div className="plan-preview">
        <b>Vista previa de cuotas</b>
        {invalid ? (
          <p>{invalid}</p>
        ) : (
          <>
            <div className="preview-lines">
              {charges.slice(0, 3).map((c, i) => (
                <div key={i}>
                  <span>
                    {c.concept} <small>{c.dueDate}</small>
                  </span>
                  <strong>{money(c.amount)}</strong>
                </div>
              ))}
              {charges.length > 3 && (
                <small>… y {charges.length - 3} cuotas más</small>
              )}
            </div>
            <div className="preview-total">
              <span>Total del plan</span>
              <b>{money(charges.reduce((sum, c) => sum + c.amount, 0))}</b>
            </div>
          </>
        )}
        <small>
          Incluye {money(licenseFee)} de licencia en cada mensualidad. El descuento aplica
          según el vencimiento y no reduce la licencia. El corte mensual
          continúa al terminar el plan mientras la inscripción siga activa.
        </small>
      </div>
    </div>
  );
}
