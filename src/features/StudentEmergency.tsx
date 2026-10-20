import { Modal } from "../components/UI";
import { admissionRows } from "../lib/admission";
import type { Student } from "../lib/types";
export function StudentEmergency({
  student,
  onClose,
}: {
  student?: Student;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`Emergencias · ${student?.firstName || "Estudiante"}`}
      subtitle="Contactos, salud y personas autorizadas para el recojo."
      onClose={onClose}
      submitLabel="Cerrar"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <section className="emergency-summary">
        <p>
          <b>Alergias:</b> {student?.allergies || "Sin información"}
        </p>
        <p>
          <b>Alimentación:</b> {student?.foodRestrictions || "Sin información"}
        </p>
        {[
          [student?.emergencyContact, student?.emergencyPhone],
          [student?.secondEmergencyContact, student?.secondEmergencyPhone],
        ].map(([name, phone], i) => (
          <p key={i}>
            <b>{name || `Contacto ${i + 1} pendiente`}</b>
            {phone && (
              <>
                {" "}
                · <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`}>{phone}</a>
              </>
            )}
          </p>
        ))}
        <p>
          <b>Seguro:</b>{" "}
          {student?.hasInsurance
            ? student.insuranceProvider || "Sí"
            : student?.hasInsurance === false
              ? "No"
              : "Pendiente"}{" "}
          {student?.insuranceNumber}
        </p>
        <p>{student?.medicalConditions}</p>
        <p>{student?.careInstructions}</p>
      </section>
      <div className="detail-grid">
        {admissionRows(student?.admissionDetails).map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <p className="muted">
        Los autorizados de esta ficha no reciben acceso a la plataforma.
        Verifica el carnet y la solicitud de recogida antes de entregar al niño.
      </p>
    </Modal>
  );
}
