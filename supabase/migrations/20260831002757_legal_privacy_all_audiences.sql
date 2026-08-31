update public.legal_documents
set audience = 'ALL', updated_at = now()
where document_type = 'PRIVACY'
  and version = '1.0'
  and audience = 'CUSTOMER'
  and active = true
  and published_at is not null;
