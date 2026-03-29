module.exports = {
  eleventyComputed: {
    pageTitle:     data => data.photo?.title || data.photo?.altText || '',
    ogImage:       data => data.photo?.url?.display || '',
    ogDescription: data => data.photo?.description || '',
  },
};
