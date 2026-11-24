const nativeFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  if (init.method !== 'GET') throw new Error(`Fixture only permits GET, received ${init.method}`);
  const url = String(input);
  if (url.includes('androidpublisher.googleapis.com') && url.includes('/releases')) {
    return Response.json({ releases: [{ releaseName: 'fixture-google-release', activeArtifacts: [{ versionCode: '42' }], releaseLifecycleState: 'completed' }] });
  }
  if (url.includes('api.appstoreconnect.apple.com') && url.includes('/appStoreVersions')) {
    return Response.json({ data: [{ id: 'fixture-apple-version', attributes: { versionString: '3.1', appStoreState: 'READY_FOR_SALE' } }] });
  }
  return nativeFetch(input, init);
};
