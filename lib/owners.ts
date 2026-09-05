/* Who the house belongs to. An account signing in with one of these
   addresses is marked owner: it claims the original single-user data,
   and it is the account the auditing CLI reads. Spelling variants are
   deliberate - two GitHub identities exist on the owner's machine. */
export const OWNER_EMAILS = [
  "crownleksfemi@gmail.com",
  "crownlexfemi@gmail.com",
  "godslovepam@gmail.com",
];

/** Rows created before accounts existed carry this sentinel until the
 *  owner's first sign-in claims them. */
export const ZERO_USER = "00000000-0000-0000-0000-000000000000";
