// WHETHER THE PERSON SIGNED IN IN THIS BROWSER IS THE SUPER ADMIN — set the
// moment the server says who is signed in, beside the department scope
// (store/AuthContext.tsx), and read by code outside React that words things for
// him: Mitra's live facts (engine/assistantLocal.ts buildAssistantContext) tell
// the model that the staff's working hours do not hold him, so that asked late
// in the evening "can I still work?" Mitra says yes (REQUIREMENTS §84 addendum,
// 6-Oct-2026). Nobody signed in, and the server's engine worker
// (engineHost/entry.ts, which answers the phone app — its own answer carries
// the line, backend/apiV1Records.ts): false.
let superAdmin = false;

export function setSuperAdminSignedIn(yes: boolean): void {
  superAdmin = yes;
}

export function superAdminSignedIn(): boolean {
  return superAdmin;
}
