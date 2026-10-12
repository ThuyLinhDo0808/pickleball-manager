-- Social Manager (play communities, "cộng đồng xé vé") becomes its own product with four
-- plans (Basic / Standard / Advanced / Pro), bought and renewed apart from the Club plan.
-- host_subscriptions.social_manager / social_manager_paid_until keep saying whether it is
-- on and until when; sm_tier says which plan. Hosts who already paid the old single
-- Social Manager add-on keep it as Basic. Communities whose host has no Social Manager
-- plan are locked until one is bought (the Club plan no longer covers them).
alter table public.host_subscriptions add column if not exists sm_tier public.subscription_tier;
update public.host_subscriptions set sm_tier = 'basic' where social_manager and sm_tier is null;
