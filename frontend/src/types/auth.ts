export type UserRole = "admin" | "staff";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /**
   * The departments whose documents this account may see — the codes of the
   * company's own master list of formats (QC, PRD, HR, MKT, …). EMPTY means
   * every department: the administrator, management, the MR and QA all work
   * across the plant, and so does an account nobody has assigned yet.
   * See engine/departmentScope.ts.
   */
  departments: string[];
}

/** A user as the administrator sees them in Master Data → Departments & access. */
export interface ManagedUser extends AuthUser {
  createdAt: string;
}
