-- 0014_rewards_customer_trigger.sql
-- Vincula/crea customers + customer_rewards al registrarse en Turkana Rewards.

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  if coalesce(new.raw_user_meta_data->>'rewards', '') <> 'true' then
    return new;
  end if;

  select id into cid from customers where email = new.email;
  if cid is not null then
    update customers set
      auth_user_id = new.id,
      full_name = coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), full_name),
      phone = coalesce(nullif(new.raw_user_meta_data->>'phone', ''), phone),
      updated_at = now()
    where id = cid;
  else
    insert into customers (auth_user_id, full_name, email, phone)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
      new.email,
      nullif(new.raw_user_meta_data->>'phone', '')
    )
    returning id into cid;
  end if;

  insert into customer_rewards (customer_id) values (cid)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer on auth.users;
create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function public.handle_new_customer();
