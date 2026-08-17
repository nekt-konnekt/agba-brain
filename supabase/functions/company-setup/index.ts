import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DepartmentInput = {
  name: string;
  slug?: string;
  description?: string;
  head: {
    full_name: string;
    email: string;
  };
};

type SetupInput = {
  company: {
    name: string;
    slug: string;
    timezone?: string;
    currency_code?: string;
  };
  ceo: {
    full_name: string;
  };
  departments: DepartmentInput[];
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireEmail(value: unknown, field: string) {
  const email = requireText(value, field).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error(`${field} must be a valid email`);
  return email;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase function environment is incomplete" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Authorization required" });
  const token = authHeader.slice("Bearer ".length);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: authData, error: authError } = await callerClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Invalid authentication" });

    const callerAuthId = authData.user.id;

    const { data: existingCaller, error: existingError } = await admin
      .from("agba_users")
      .select("id, organization_id, role_id, active")
      .eq("auth_user_id", callerAuthId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingCaller) return json(409, { error: "Authenticated user is already provisioned in Agba" });

    const input = await req.json() as SetupInput;
    const companyName = requireText(input?.company?.name, "company.name");
    const companySlug = cleanSlug(requireText(input?.company?.slug, "company.slug"));
    const ceoName = requireText(input?.ceo?.full_name, "ceo.full_name");
    const departments = input?.departments ?? [];

    if (!companySlug) throw new Error("company.slug is invalid");
    if (!Array.isArray(departments) || departments.length < 1) {
      throw new Error("At least one department is required");
    }
    if (departments.length > 50) throw new Error("A maximum of 50 departments is allowed in V1");

    const normalizedDepartments = departments.map((department, index) => {
      const name = requireText(department?.name, `departments[${index}].name`);
      const slug = cleanSlug(department?.slug || name);
      if (!slug) throw new Error(`departments[${index}].slug is invalid`);
      const fullName = requireText(department?.head?.full_name, `departments[${index}].head.full_name`);
      const email = requireEmail(department?.head?.email, `departments[${index}].head.email`);
      return { name, slug, description: department?.description?.trim() || null, head: { fullName, email } };
    });

    const seenSlugs = new Set<string>();
    for (const department of normalizedDepartments) {
      if (seenSlugs.has(department.slug)) throw new Error(`Duplicate department slug: ${department.slug}`);
      seenSlugs.add(department.slug);
    }

    const { data: roles, error: rolesError } = await admin
      .from("agba_roles")
      .select("id, code")
      .in("code", ["ceo", "department_head"]);
    if (rolesError) throw rolesError;
    const ceoRole = roles?.find((role) => role.code === "ceo");
    const headRole = roles?.find((role) => role.code === "department_head");
    if (!ceoRole || !headRole) throw new Error("Agba roles are not initialized");

    const { data: organization, error: orgError } = await admin
      .from("agba_organizations")
      .insert({
        name: companyName,
        slug: companySlug,
        timezone: input.company.timezone?.trim() || "Africa/Lagos",
        currency_code: (input.company.currency_code?.trim() || "NGN").toUpperCase(),
      })
      .select("id, name, slug, timezone, currency_code")
      .single();
    if (orgError) throw orgError;

    const createdHeadIds: string[] = [];
    try {
      const { data: ceo, error: ceoError } = await admin
        .from("agba_users")
        .insert({
          organization_id: organization.id,
          auth_user_id: callerAuthId,
          role_id: ceoRole.id,
          department_id: null,
          full_name: ceoName,
          email: authData.user.email ?? null,
          active: true,
        })
        .select("id, full_name, email")
        .single();
      if (ceoError) throw ceoError;

      const createdDepartments: Array<{ id: string; name: string; slug: string; head_user_id: string }> = [];

      for (const department of normalizedDepartments) {
        const { data: dbDepartment, error: departmentError } = await admin
          .from("agba_departments")
          .insert({
            organization_id: organization.id,
            name: department.name,
            slug: department.slug,
            description: department.description,
          })
          .select("id, name, slug")
          .single();
        if (departmentError) throw departmentError;

        const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(department.head.email, {
          data: { full_name: department.head.fullName, agba_role: "department_head" },
        });
        if (inviteError) throw inviteError;
        if (!invite.user) throw new Error(`Could not provision ${department.head.email}`);

        createdHeadIds.push(invite.user.id);

        const { data: head, error: headError } = await admin
          .from("agba_users")
          .insert({
            organization_id: organization.id,
            auth_user_id: invite.user.id,
            role_id: headRole.id,
            department_id: dbDepartment.id,
            full_name: department.head.fullName,
            email: department.head.email,
            active: true,
          })
          .select("id, full_name, email")
          .single();
        if (headError) throw headError;

        createdDepartments.push({ id: dbDepartment.id, name: dbDepartment.name, slug: dbDepartment.slug, head_user_id: head.id });
      }

      const { error: completeError } = await admin
        .from("agba_organizations")
        .update({ setup_completed_at: new Date().toISOString(), setup_completed_by: ceo.id })
        .eq("id", organization.id);
      if (completeError) throw completeError;

      return json(201, {
        organization,
        ceo,
        departments: createdDepartments,
        setup_completed: true,
      });
    } catch (error) {
      for (const authUserId of createdHeadIds) {
        await admin.auth.admin.deleteUser(authUserId);
      }
      await admin.from("agba_organizations").delete().eq("id", organization.id);
      throw error;
    }
  } catch (error) {
    console.error("company-setup failed", error);
    const message = error instanceof Error ? error.message : "Company setup failed";
    return json(400, { error: message });
  }
});
