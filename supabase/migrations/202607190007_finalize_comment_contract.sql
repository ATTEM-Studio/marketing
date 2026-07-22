comment on function public.finalize_buyer_registration(uuid, text) is
  'Server-only atomic finalization. Repeated explicit user confirmation returns the existing store; auth callbacks never finalize registration automatically.';
