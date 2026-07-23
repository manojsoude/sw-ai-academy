/**
 * Copyright IBM Corp. 2025
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Button,
  Column,
  FileUploaderDropContainer,
  Form,
  Grid,
  InlineLoading,
  InlineNotification,
  Link,
  Loading,
  Tag,
  Tile,
} from '@carbon/react';
import { Upload } from '@carbon/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageLayout } from '../../layouts/page-layout';
import { getContracts, uploadContract } from '../../api/contracts';
import {
  isAcceptedFileType,
  validateFile,
  MAX_FILE_SIZE,
} from '../../utils/uploadValidation';

const ACCEPTED_FILE_TYPES = [
  '.pdf',
  '.docx',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPT_ATTRIBUTE = ACCEPTED_FILE_TYPES.join(',');
const PROCESSING_DELAY_MS = 1000;
const COMPLETE_DELAY_MS = 3000;

const formatTimestamp = (value) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const sortContracts = (contracts) =>
  [...contracts].sort(
    (left, right) =>
      new Date(right.upload_timestamp).getTime() -
      new Date(left.upload_timestamp).getTime(),
  );

const StatusCell = ({ status }) => {
  if (status === 'Processing') {
    return (
      <div className="cra--contract-upload__status-loading">
        <InlineLoading description="Processing" status="active" />
      </div>
    );
  }

  const type = status === 'Complete' ? 'green' : 'blue';

  return <Tag type={type}>{status}</Tag>;
};

const QueueRow = ({ contract }) => {
  const isComplete = contract.status === 'Complete';

  return (
    <li className="cra--contract-upload__queue-row">
      <div>
        <p className="cra--contract-upload__queue-primary">
          {contract.original_filename}
        </p>
        <p className="cra--contract-upload__queue-secondary">
          Job ID: {contract.id}
        </p>
      </div>
      <div>
        <p className="cra--contract-upload__queue-secondary">
          Uploaded {formatTimestamp(contract.upload_timestamp)}
        </p>
      </div>
      <div className="cra--contract-upload__queue-status">
        <StatusCell status={contract.status} />
      </div>
      <div className="cra--contract-upload__queue-action">
        {isComplete ? (
          <Link href="#" onClick={(event) => event.preventDefault()}>
            Open report
          </Link>
        ) : (
          <span className="cra--contract-upload__queue-secondary">
            Not ready
          </span>
        )}
      </div>
    </li>
  );
};

const ContractUpload = () => {
  const [contracts, setContracts] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const timersRef = useRef({});

  const selectedFile = selectedFiles[0];

  const clearTimers = useCallback((contractId) => {
    const timerSet = timersRef.current[contractId];

    if (!timerSet) {
      return;
    }

    window.clearTimeout(timerSet.processing);
    window.clearTimeout(timerSet.complete);
    delete timersRef.current[contractId];
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadContracts = async () => {
      try {
        const data = await getContracts();

        if (!cancelled) {
          setContracts(sortContracts(data));
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Something went wrong. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQueue(false);
        }
      }
    };

    loadContracts();

    return () => {
      cancelled = true;
      const timers = timersRef.current;
      Object.keys(timers).forEach((contractId) => {
        const timerSet = timers[contractId];

        if (!timerSet) {
          return;
        }

        window.clearTimeout(timerSet.processing);
        window.clearTimeout(timerSet.complete);
      });
      timersRef.current = {};
    };
  }, [clearTimers]);

  const resetSelection = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const startStatusAnimation = useCallback(
    (contractId) => {
      clearTimers(contractId);

      const processing = window.setTimeout(() => {
        setContracts((currentContracts) =>
          currentContracts.map((contract) =>
            contract.id === contractId
              ? { ...contract, status: 'Processing' }
              : contract,
          ),
        );
      }, PROCESSING_DELAY_MS);

      const complete = window.setTimeout(() => {
        setContracts((currentContracts) =>
          currentContracts.map((contract) =>
            contract.id === contractId
              ? { ...contract, status: 'Complete' }
              : contract,
          ),
        );
        clearTimers(contractId);
      }, COMPLETE_DELAY_MS);

      timersRef.current[contractId] = { processing, complete };
    },
    [clearTimers],
  );

  const handleFileChange = useCallback((event) => {
    const nextFiles = event.target?.files ? Array.from(event.target.files) : [];
    const nextFile = nextFiles[0];

    setErrorMessage('');

    if (!nextFile) {
      setSelectedFiles([]);
      return;
    }

    const validationMessage = validateFile(nextFile);

    if (validationMessage) {
      setErrorMessage(validationMessage);
      setSelectedFiles([]);
      event.target.value = '';
      return;
    }

    setSelectedFiles([nextFile]);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!selectedFile) {
        return;
      }

      const validationMessage = validateFile(selectedFile);

      if (validationMessage) {
        setErrorMessage(validationMessage);
        resetSelection();
        return;
      }

      setErrorMessage('');
      setIsSubmitting(true);

      try {
        const response = await uploadContract(selectedFile);
        const newContract = {
          id: response.id,
          original_filename: selectedFile.name,
          upload_timestamp: new Date().toISOString(),
          status: response.status,
        };

        setContracts((currentContracts) =>
          sortContracts([newContract, ...currentContracts]),
        );
        resetSelection();
        startStatusAnimation(response.id);
      } catch (error) {
        setErrorMessage(error.message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [resetSelection, selectedFile, startStatusAnimation],
  );

  const isSubmitDisabled = !selectedFile || isSubmitting;
  const queueItems = useMemo(() => sortContracts(contracts), [contracts]);

  return (
    <PageLayout className="cra--contract-upload" fallback={<Loading />}>
      <Grid className="cra--contract-upload__header-grid">
        <Column sm={4} md={8} lg={16}>
          <h1 className="cra--contract-upload__title">Contract uploads</h1>
          <p className="cra--contract-upload__subtitle">
            Upload one PDF or DOCX contract up to 10 MB. New uploads appear at
            the top of the queue with their job ID and processing status.
          </p>
        </Column>
      </Grid>

      <Grid className="cra--contract-upload__form-grid">
        <Column sm={4} md={8} lg={7}>
          <Tile className="cra--contract-upload__panel">
            <Form onSubmit={handleSubmit}>
              <div className="cra--contract-upload__form-section">
                <h2 className="cra--contract-upload__section-title">
                  Upload contract
                </h2>
                <p className="cra--contract-upload__helper-text">
                  Accepted formats: PDF and DOCX. Maximum file size: 10 MB.
                </p>
              </div>

              {errorMessage ? (
                <InlineNotification
                  kind="error"
                  lowContrast={true}
                  hideCloseButton={true}
                  title="Upload error"
                  subtitle={errorMessage}
                  className="cra--contract-upload__notification"
                />
              ) : null}

              <div className="cra--contract-upload__form-section">
                <FileUploaderDropContainer
                  accept={ACCEPTED_FILE_TYPES}
                  disabled={isSubmitting}
                  labelText="Drag and drop a contract file here or click to browse"
                  name="file"
                  onAddFiles={handleFileChange}
                />
                <input
                  className="cra--contract-upload__file-input"
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                />
              </div>

              <div className="cra--contract-upload__form-section">
                <p className="cra--contract-upload__selected-file-label">
                  Selected file
                </p>
                <p className="cra--contract-upload__selected-file-value">
                  {selectedFile?.name || 'No file selected'}
                </p>
              </div>

              <Button
                renderIcon={Upload}
                type="submit"
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? 'Uploading…' : 'Upload contract'}
              </Button>
            </Form>
          </Tile>
        </Column>
      </Grid>

      <Grid className="cra--contract-upload__queue-grid">
        <Column sm={4} md={8} lg={16}>
          <Tile className="cra--contract-upload__panel">
            <div className="cra--contract-upload__queue-header">
              <div>
                <h2 className="cra--contract-upload__section-title">
                  Contract queue
                </h2>
                <p className="cra--contract-upload__helper-text">
                  Most recent uploads appear first.
                </p>
              </div>
            </div>

            {isLoadingQueue ? (
              <InlineLoading description="Loading queue" status="active" />
            ) : (
              <ul className="cra--contract-upload__queue-list">
                {queueItems.length > 0 ? (
                  queueItems.map((contract) => (
                    <QueueRow key={contract.id} contract={contract} />
                  ))
                ) : (
                  <li className="cra--contract-upload__queue-empty">
                    No contracts uploaded yet.
                  </li>
                )}
              </ul>
            )}
          </Tile>
        </Column>
      </Grid>
    </PageLayout>
  );
};

export default ContractUpload;
