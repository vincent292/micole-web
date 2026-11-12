import type { GradeTotal } from './gradeSheet';
import type { Identity, Role } from './types';

export interface SchoolGrade {
  id: string;
  school_id: string;
  academic_year: number;
  name: string;
  level: string;
  grade_code: string | null;
}
export interface AcademicSummary {
  studentName: string;
  classroomName: string;
  year: number;
  passMark: number;
  publishedOnly: boolean;
  terms?: {id: string; name: string}[];
  subjects?: {
    id: string;
    name: string;
    periods: {termId: string; termName: string; method: string; total: GradeTotal; assessments?: {title:string;maxScore:number;weight:number;score:number|null;qualitative:string|null;exempt:boolean}[]}[];
  }[];
}
export interface Observation {
  id: string;
  student_id: string;
  studentName: string;
  subjectName: string;
  authorName: string;
  created_at: string;
  kind: 'positive' | 'incident';
  body: string;
  photo?: string;
}
export function isAcademicAdministrator(role: Role, identity: Identity, schoolId?: string) {
  return role === 'director' || role === 'scheduler' && !!schoolId && !!identity.secretarySchoolIds?.includes(schoolId);
}
export function canCollectPayments(role: Role, identity: Identity, schoolId?: string) {
  return role === 'director' || role === 'scheduler' && !!schoolId && !!identity.collectionSchoolIds?.includes(schoolId);
}
export function percentage(total: GradeTotal) {
  return total.missing === 0 && total.score != null && total.max_score != null && total.max_score > 0
    ? Math.round(total.score / total.max_score * 10000) / 100
    : null;
}
export async function observationPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
    throw Error('Elige una foto JPG, PNG o WebP de hasta 10 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1000 / bitmap.width, 1000 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('No pudimos preparar la foto.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.65);
    if (result.length >= 400000) throw Error('La foto tiene demasiado detalle. Elige una imagen más pequeña.');
    return result;
  } finally {
    bitmap.close();
  }
}
