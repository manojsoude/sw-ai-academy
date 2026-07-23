/**
 * Copyright IBM Corp. 2025
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const getErrorMessage = async (response) => {
  try {
    const data = await response.json();

    if (typeof data?.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  } catch {
    // Ignore malformed error bodies and fall back to the generic message.
  }

  return GENERIC_ERROR_MESSAGE;
};

export const getContracts = async () => {
  const response = await fetch('/contracts');

  if (!response.ok) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return response.json();
};

export const uploadContract = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  let response;

  try {
    response = await fetch('/contracts', {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
};

export { GENERIC_ERROR_MESSAGE };
