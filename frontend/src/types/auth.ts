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

/** A user as the administrator sees them on Users & Access (REQUIREMENTS §66). Never a password or its hash. */
export interface ManagedUser extends AuthUser {
  createdAt: string;
  /** Still on the password the administrator gave them. */
  mustChangePassword?: boolean;
  /** False for somebody who has left: they cannot sign in, and nothing of theirs is deleted. */
  active?: boolean;
  /** When they last signed in, ISO; null if they never have. */
  lastSignIn?: string | null;
}
