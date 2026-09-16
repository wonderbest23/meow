-- Re-entering the queue must obey the same concurrency rules as a new reservation.
create or replace function public.guard_artifact_resume_limits() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('queued','running') and old.status not in ('queued','running') then
    perform pg_advisory_xact_lock(hashtextextended('plan-state:' || new.owner_hash, 0));
    if exists(select 1 from public.plan_artifact_updates
      where owner_hash = new.owner_hash and plan_id = new.plan_id and id <> new.id
        and status in ('queued','running','ready')) then
      raise exception 'ARTIFACT_REVIEW_PENDING';
    end if;
    if (select count(*) from public.plan_artifact_updates
      where owner_hash = new.owner_hash and id <> new.id and status in ('queued','running')) >= 2 then
      raise exception 'ARTIFACT_CONCURRENCY_LIMIT';
    end if;
  end if;
  return new;
end;
$$;
create trigger artifact_resume_limits before update of status on public.plan_artifact_updates
for each row execute function public.guard_artifact_resume_limits();
