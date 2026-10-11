// Signed-in editors only (the page includes this script just for them):
// adds an "Edit" action to the lightbox that opens the photo in the EmDash admin.
(function () {
  var img = document.getElementById('lightbox-img');
  var actions = document.querySelector('#lightbox .lightbox__actions');
  if (!img || !actions) return;

  var link = document.createElement('a');
  link.className = 'lightbox__action-btn';
  link.id = 'lightbox-edit';
  link.textContent = 'Edit';
  link.hidden = true;
  actions.appendChild(link);

  function sync() {
    var src = img.getAttribute('src');
    var photo = (window.GalleryPhotos || []).find(function (p) { return p.url && p.url.display === src; });
    link.hidden = !photo || !photo.entryId;
    if (photo && photo.entryId) link.href = '/_emdash/admin/content/photos/' + photo.entryId;
  }
  new MutationObserver(sync).observe(img, { attributes: true, attributeFilter: ['src'] });
  sync();
})();
