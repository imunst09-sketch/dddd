import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('APP_URL') || 'https://eghp09dj5yqw38tf.jitda.io/';
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), { status: 500, headers: corsHeaders });

  const { data: reminders, error } = await supabase.from('reminders').select('id,email,item_name,price,analysis_record_id').eq('status', 'pending').lte('remind_at', new Date().toISOString()).limit(50);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  const sent = [];
  for (const reminder of reminders || []) {
    const detailUrl = `${appUrl}?history=${encodeURIComponent(reminder.analysis_record_id)}`;
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM') || 'Greenchoice <onboarding@resend.dev>', to: [reminder.email], subject: `${reminder.item_name}, 아직도 필요하신가요?`, html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#214b39"><h2>🧊 소비를 다시 생각해볼 시간이에요</h2><p>안녕하세요! 3일 전 고민하셨던 <strong>${reminder.item_name}</strong>(${Number(reminder.price).toLocaleString('ko-KR')}원), 아직도 정말 필요하신가요?</p><p>지금 다시 생각해보세요!</p><p><a href="${detailUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#27664b;color:#fff;text-decoration:none">소비 기록 다시 확인하기</a></p></div>` }) });
    if (response.ok) { await supabase.from('reminders').update({ status: 'sent' }).eq('id', reminder.id); sent.push(reminder.id); }
  }
  return new Response(JSON.stringify({ sent: sent.length }), { headers: corsHeaders });
});
