update public.stage_artifacts
set review_status = 'automated_review'
where review_status = 'manager_review';

alter table public.stage_artifacts
  drop constraint if exists stage_artifacts_review_status_check;

alter table public.stage_artifacts
  add constraint stage_artifacts_review_status_check
  check (review_status in ('draft', 'automated_review', 'user_review', 'approved', 'rejected'));
