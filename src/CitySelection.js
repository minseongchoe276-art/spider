// Keep map navigation available before graphics or streamed terrain are ready.
export function selectedCity(search) {
  return new URLSearchParams(search).get('city') === 'procedural' ? 'procedural' : 'hong-kong';
}

export function initCitySelection(root = document, search = location.search) {
  const city = selectedCity(search);
  for (const link of root.querySelectorAll('[data-city]')) {
    if (link.dataset.city === city) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const label of root.querySelectorAll('[data-current-city]')) {
    label.textContent = city === 'hong-kong' ? '홍콩' : '로컬 도시';
  }
}
