import { seed } from "./seed";
import { today } from "./billing";
import {
  emptySchoolWorkspace,
  weightedSubject,
  type SchoolWorkspace,
  type ReportCard,
} from "./school";
import type { AppData } from "./types";
export function makeDemoSeed(): AppData {
  const data = structuredClone(seed),
    day = today(),
    year = Number(day.slice(0, 4)),
    month = day.slice(0, 7),
    next = new Date(`${day}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 7);
  data.schools = data.schools.slice(0, 1).map((s) => ({
    ...s,
    name: "Colegio y Guardería MiCole · Demo",
      platformEnabled: true, activationEnabled: false,
    slug: "micole-demo",
    initials: "MD",
    color: "#3D6EF7",
    city: "Cochabamba",
    nit: "0000000000",
    address: "Dirección ficticia para demostración",
    phone: "",
    showOnLanding: false,
    createdAt: `${year}-01-12`,
  }));
  data.classrooms = data.classrooms
    .filter((r) => r.schoolId === "s1")
    .map((r) => ({
      ...r,
      academicYear: year,
      active: true,
      capacity: 25,
      monthlyFee: r.id === "c1" ? 420 : 480,
      startTime: "08:00",
      endTime: "12:00",
      weekdays: [1, 2, 3, 4, 5],
    }));
  data.classrooms.push({
    id: "c4",
    schoolId: "s1",
    name: "1.º Primaria B",
    level: "Primaria",
    academicYear: year,
    active: true,
    capacity: 30,
    monthlyFee: 610,
    schedule: "08:00 - 12:30",
    startTime: "08:00",
    endTime: "12:30",
    teacherIds: ["t1", "t3"],
    subjectsEnabled: true,
  });
  data.teachers = data.teachers
    .filter((t) => t.schoolId === "s1")
    .map((t, i) => ({
      ...t,
      email: i === 0 ? "docente@micole.test" : `docente${i + 1}@micole.test`,
    }));
  data.students = data.students.map((s, i) => ({
    ...s,
    schoolId: "s1",
    profileComplete: true,
    identityNumber: `DEMO-${i + 1}`,
    motherName: i === 0 || i === 6 ? "Daniela Martínez" : s.guardianName,
    motherEmail:
      i === 0 || i === 6 ? "familia@micole.test" : `madre${i + 1}@micole.test`,
    fatherName: `Padre de ${s.firstName}`,
    fatherEmail: `padre${i + 1}@micole.test`,
    guardianEmail:
      i === 0 || i === 6 ? "familia@micole.test" : `madre${i + 1}@micole.test`,
    emergencyContact: "Contacto ficticio",
    emergencyPhone: "00000000",
    enrolledAt: `${year}-02-01`,
    status: i === 4 ? "pending" : "active",
  }));
  data.students[6] = {
    ...data.students[6],
    firstName: "Diego",
    lastName: "Martínez",
    guardianName: "Daniela Martínez",
  };
  data.students[0].birthDate = `${year - 3}-${day.slice(5)}`;
  data.charges = data.students.flatMap((s, i) => [
    {
      id: `p${i + 1}`,
      schoolId: "s1",
      studentId: s.id,
      concept: `Mensualidad ${month}`,
      period: month,
      dueDate: `${month}-10`,
      amount: s.monthlyFee,
      paidAmount: [0, 3, 5, 6].includes(i) ? s.monthlyFee : 0,
      status: [0, 3, 5, 6].includes(i)
        ? ("paid" as const)
        : ("pending" as const),
      paidAt: [0, 3, 5, 6].includes(i) ? `${month}-05` : undefined,
      minimumAccessRatio: 0.5,
    },
    {
      id: `next-${s.id}`,
      schoolId: "s1",
      studentId: s.id,
      concept: `Mensualidad ${nextMonth}`,
      period: nextMonth,
      dueDate: `${nextMonth}-10`,
      amount: s.monthlyFee,
      paidAmount: 0,
      status: "pending" as const,
      minimumAccessRatio: 1,
    },
  ]);
  data.platformCharges = data.platformCharges
    .filter((c) => c.schoolId === "s1")
    .map((c) => ({ ...c, period: month }));
  data.announcements = data.announcements
    .filter((a) => a.schoolId === "s1")
    .map((a) => ({ ...a, createdAt: day }));
  data.announcements.push({
    id: "demo-welcome",
    schoolId: "s1",
    title: "Bienvenidos a nuestra comunidad de ejemplo",
    content:
      "Toda la información de esta demostración es ficticia. Explora los roles y prueba los formularios; los cambios solo quedan en tu navegador.",
    audience: "all",
    createdAt: day,
  });
  data.events = data.events.map((e) => ({ ...e, date: day }));
  data.events.push({
    id: "demo-evaluation",
    schoolId: "s1",
    classroomId: "c4",
    title: "Evaluación de Matemáticas",
    date: day,
    description: "Conteo, sumas y resolución de problemas.",
    type: "event",
  });
  data.dailyEntries = data.dailyEntries.map((e) => ({ ...e, date: day }));
  data.operationSettings = [
    {
      id: "s1",
      schoolId: "s1",
      finalFullInstallments: 2,
      requireAnnualMaterials: false,
      familyPolicy: "both",
      childCiRequired: false,
    },
  ];
  data.subjectCatalog = [
    "Lenguaje",
    "Matemáticas",
    "Cálculo",
    "Ciencias Naturales",
    "Ciencias Sociales",
    "Inglés",
    "Educación Física",
    "Artes Plásticas",
    "Música",
    "Tecnología",
  ].map((name, i) => ({ id: `catalog-${i}`, name }));
  data.subjects = ["Matemáticas", "Lenguaje", "Inglés"].map((name, i) => ({
    id: `subject-${i}`,
    schoolId: "s1",
    name,
  }));
  data.classSubjects = data.subjects.map((s, i) => ({
    id: `cs-${i}`,
    schoolId: "s1",
    classroomId: "c4",
    subjectId: s.id,
    active: true,
  }));
  data.subjectTeachers = data.classSubjects.map((s, i) => ({
    id: `st-${i}`,
    schoolId: "s1",
    classSubjectId: s.id,
    teacherId: i === 2 ? "t3" : "t1",
  }));
  data.assignments = [
    {
      id: "demo-task-initial",
      schoolId: "s1",
      classroomId: "c1",
      title: "Descubrimos los colores",
      instructions:
        "Dibuja tres objetos de colores diferentes y cuéntanos cuál es tu favorito.",
      dueAt: `${nextMonth}-05T23:59:00-04:00`,
      allowLate: true,
      maxScore: 100,
      status: "published",
      createdBy: "demo-teacher",
      createdAt: day,
      updatedAt: day,
    },
    {
      id: "demo-task-math",
      schoolId: "s1",
      classroomId: "c4",
      classSubjectId: "cs-0",
      title: "Sumas en casa",
      instructions:
        "Resuelve cinco sumas usando objetos de casa. Escribe tus respuestas y cómo las resolviste.",
      dueAt: `${nextMonth}-05T23:59:00-04:00`,
      allowLate: true,
      maxScore: 100,
      status: "published",
      createdBy: "demo-teacher",
      createdAt: day,
      updatedAt: day,
    },
  ];
  data.submissions = [
    {
      id: "demo-submission",
      schoolId: "s1",
      assignmentId: "demo-task-initial",
      studentId: "a2",
      body: "Mi color favorito es azul. Dibujé el cielo, una flor y un sol.",
      status: "submitted",
      feedback: "",
      submittedBy: "demo-student",
      submittedAt: day,
      updatedAt: day,
      revision: 1,
    },
  ];
  data.grades = [
    {
      id: "demo-grade",
      schoolId: "s1",
      studentId: "a1",
      subject: "Desarrollo personal",
      period: "Segundo trimestre",
      score: "Muy bien",
      recommendation: "Participa con entusiasmo y comparte sus materiales.",
      createdAt: day,
    },
  ];
  data.media = [
    {
      id: "demo-gallery",
      schoolId: "s1",
      studentId: "a1",
      caption: "Exploramos formas y colores · Ilustración de ejemplo",
      objectKey: "demo/illustration",
      mimeType: "image/svg+xml",
      createdAt: day,
      localUrl: "/demo-gallery.svg",
    },
  ];
  data.messages = [
    {
      id: "demo-message",
      schoolId: "s1",
      studentId: "a1",
      body: "Hoy Sofía disfrutó mucho la actividad de pintura. ¡Gracias por acompañarla!",
      createdAt: `${day}T12:00:00-04:00`,
      authorId: "demo-teacher",
      authorName: "Camila · Demo",
      authorRole: "teacher",
    },
  ];
  data.requests = [
    {
      id: "demo-permission",
      schoolId: "s1",
      studentId: "a2",
      type: "absence",
      date: day,
      reason: "Consulta médica de ejemplo",
      pickupName: "",
      pickupId: "",
      vehiclePlate: "",
      status: "pending",
      response: "",
      createdAt: day,
    },
  ];
  data.academicRequests = [
    {
      id: "demo-materials",
      schoolId: "s1",
      classroomId: "c1",
      kind: "annual_materials",
      academicYear: year,
      title: "Materiales para aprender jugando",
      details:
        "Una caja de crayones, plastilina y un cuaderno de dibujo. Identificar con nombre.",
      eventDate: day,
      amount: 0,
      blocksAccess: false,
      status: "approved",
      createdBy: "demo-director",
      reviewNote: "Lista aprobada",
      createdAt: day,
    },
    {
      id: "demo-trip",
      schoolId: "s1",
      classroomId: "c4",
      kind: "activity",
      academicYear: year,
      title: "Visita al museo de ciencias",
      details: "Actividad de ejemplo. Incluye transporte y entrada.",
      eventDate: `${nextMonth}-08`,
      amount: 35,
      dueDate: `${nextMonth}-05`,
      blocksAccess: false,
      status: "approved",
      createdBy: "demo-director",
      reviewNote: "Aprobado",
      createdAt: day,
    },
  ];
  data.schoolReceipts = [
    {
      id: "demo-receipt",
      schoolId: "s1",
      studentId: "a1",
      total: 420,
      paymentMethod: "cash",
      reference: "DEMO-001",
      items: [{ chargeId: "p1", concept: `Mensualidad ${month}`, amount: 420 }],
      verificationSource: "manual",
      recordedBy: "demo-director",
      createdAt: `${month}-05T12:00:00-04:00`,
    },
  ];
  data.invoiceRequests = [
    {
      id: "demo-invoice",
      schoolId: "s1",
      studentId: "a1",
      receiptId: "demo-receipt",
      legalName: "Daniela Martínez · Ejemplo",
      nitCi: "00000000",
      phone: "00000000",
      amount: 420,
      status: "pending",
      invoiceNumber: "",
      createdAt: day,
    },
  ];
  data.notifications = [
    {
      id: "demo-notification",
      userId: "demo",
      schoolId: "s1",
      kind: "announcement",
      sourceId: "demo-welcome",
      title: "Tu demo está lista",
      body: "Explora cada rol y restablece los datos cuando quieras.",
      target: "announcements",
      createdAt: day,
    },
  ];
  return data;
}
export function makeDemoWorkspace(data: AppData): SchoolWorkspace {
  const w = emptySchoolWorkspace(),
    day = today(),
    year = Number(day.slice(0, 4));
  w.years = [
    {
      id: "year-demo",
      schoolId: "s1",
      year,
      name: `Gestión ${year}`,
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
      status: "open",
    },
  ];
  w.enrollments = data.students.map((s) => ({
    id: `enrollment-${s.id}`,
    studentId: s.id,
    schoolId: "s1",
    classroomId: s.classroomId,
    yearId: "year-demo",
    studentName: `${s.firstName} ${s.lastName}`,
    classroomName: data.classrooms.find((r) => r.id === s.classroomId)!.name,
    level: data.classrooms.find((r) => r.id === s.classroomId)!.level,
    startedOn: `${year}-02-01`,
    status: "enrolled",
    reason: "Inscripción de demostración",
    monthlyFee: s.monthlyFee,
  }));
  w.care = [
    {
      id: "care-demo",
      studentId: "a1",
      classroomId: "c1",
      entryDate: day,
      kind: "meal",
      occurredAt: "10:00",
      food: "Fruta y yogur",
      amount: "all",
      hygiene: "",
      mood: "",
      note: "Disfrutó su merienda.",
    },
    {
      id: "rest-demo",
      studentId: "a1",
      classroomId: "c1",
      entryDate: day,
      kind: "rest",
      occurredAt: "13:00",
      endedAt: "14:00",
      food: "",
      amount: "",
      hygiene: "",
      mood: "",
      note: "Descanso tranquilo.",
    },
  ];
  w.terms = [
    {
      id: "term-demo-open",
      schoolId: "s1",
      yearId: "year-demo",
      name: "Tercer trimestre",
      startsOn: `${year}-09-01`,
      endsOn: `${year}-12-15`,
      weight: 1,
      status: "open",
      revision: 1,
    },
    {
      id: "term-demo-closed",
      schoolId: "s1",
      yearId: "year-demo",
      name: "Segundo trimestre",
      startsOn: `${year}-05-01`,
      endsOn: `${year}-08-31`,
      weight: 1,
      status: "closed",
      revision: 1,
    },
  ];
  w.assessments = [
    {
      id: "assessment-demo",
      schoolId: "s1",
      termId: "term-demo-open",
      classroomId: "c1",
      title: "Participación y creatividad",
      assessmentDate: day,
      maxScore: 100,
      weight: 1,
    },
    {
      id: "assessment-math",
      schoolId: "s1",
      termId: "term-demo-open",
      classroomId: "c4",
      classSubjectId: "cs-0",
      assignmentId: "demo-task-math",
      title: "Sumas y conteo",
      assessmentDate: day,
      maxScore: 100,
      weight: 1,
    },
  ];
  w.scores = w.assessments.flatMap((a) =>
    data.students
      .filter((s) => s.classroomId === a.classroomId)
      .map((s, i) => ({
        id: `score-${a.id}-${s.id}`,
        assessmentId: a.id,
        studentId: s.id,
        score: 85 + i * 5,
        exempt: false,
        comment: "Buen trabajo.",
      })),
  );
  w.cards = data.students.map((s) => ({
    id: `card-${s.id}`,
    termId: "term-demo-closed",
    studentId: s.id,
    classroomId: s.classroomId,
    revision: 1,
    publishedAt: day,
    content: {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      schoolName: data.schools[0].name,
      classroomId: s.classroomId,
      classroomName: data.classrooms.find((r) => r.id === s.classroomId)!.name,
      year,
      yearId: "year-demo",
      termId: "term-demo-closed",
      termName: "Segundo trimestre",
      termWeight: 1,
      scale: 100,
      startsOn: `${year}-05-01`,
      endsOn: `${year}-08-31`,
      complete: true,
      subjects: [
        {
          subject:
            s.classroomId === "c4" ? "Matemáticas" : "Evaluación general",
          score: 90,
          missing: 0,
          assessments: 1,
          exemptions: 0,
        },
      ],
    },
  }));
  return w;
}
export function demoCards(
  data: AppData,
  w: SchoolWorkspace,
  termId: string,
): ReportCard[] {
  const term = w.terms.find((t) => t.id === termId)!,
    year = w.years.find((y) => y.id === term.yearId)!;
  return w.enrollments
    .filter((e) => e.yearId === year.id)
    .map((e) => {
      const assessments = w.assessments.filter(
        (a) => a.termId === termId && a.classroomId === e.classroomId,
      );
      const subjects = [
        ...new Set(assessments.map((a) => a.classSubjectId || "")),
      ].map((id) => {
        const list = assessments.filter((a) => (a.classSubjectId || "") === id),
          result = weightedSubject(list, w.scores, e.studentId);
        return {
          classSubjectId: id || undefined,
          subject:
            data.subjects.find(
              (s) =>
                s.id === data.classSubjects.find((c) => c.id === id)?.subjectId,
            )?.name || "Evaluación general",
          ...result,
          assessments: list.length,
        };
      });
      return {
        id: crypto.randomUUID(),
        termId,
        studentId: e.studentId,
        classroomId: e.classroomId,
        revision: term.revision,
        publishedAt: new Date().toISOString(),
        content: {
          studentId: e.studentId,
          studentName: e.studentName,
          schoolName: data.schools[0].name,
          classroomId: e.classroomId,
          classroomName: e.classroomName,
          year: year.year,
          yearId: year.id,
          termId,
          termName: term.name,
          termWeight: term.weight,
          scale: 100,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          complete: subjects.every((s) => s.missing === 0),
          subjects,
        },
      };
    });
}
