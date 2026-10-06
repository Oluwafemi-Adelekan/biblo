/* Ceilings the composer and the server both have to agree on.
   They used to be written out separately in each place, which is how
   the composer came to accept an eleventh file and only mention the
   limit after the send had already failed. */

/** How many files can ride on one message. */
export const MAX_FILES = 10;

/** Supabase's own per-file ceiling. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const tooManyFiles = (n: number) =>
  `That is ${n} files. ${MAX_FILES} at a time is the limit, so send the rest in a second message.`;
