const params = new URLSearchParams(location.search);
const error = document.getElementById('error');
error.textContent = params.get('message') || '';
document.getElementById('link').placeholder = `${params.get('base') || 'https://…'}/me/…`;
document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await window.petApp.submitLink(document.getElementById('link').value);
  if (!result.ok) error.textContent = result.message || '연결하지 못했어요.';
});
