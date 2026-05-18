// SCA-486 (W-7): thin re-export of the canonical envelope helpers. Every
// envelope/errorResponse/readJsonBody used to live inline here; the
// canonical implementation now lives in lib/http/envelope.ts so all
// /api/** routes share one response shape and request_id is threaded
// end-to-end (SCA-484 W-5).

export {
  envelope,
  errorEnvelope,
  errorResponse,
  getRequestId,
  readBoundedJsonBody,
  readJsonBody,
  REQUEST_ID_HEADER,
} from "@/lib/http/envelope";
