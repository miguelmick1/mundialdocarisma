export function canCreateServerSession(params: {
  registrationOpen: boolean;
  userExists: boolean;
  userStatus?: unknown;
}): boolean {
  if (params.registrationOpen) return true;
  return params.userExists && params.userStatus !== "INACTIVE";
}
