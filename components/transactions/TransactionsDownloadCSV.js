import React from 'react';
import PropTypes from 'prop-types';
import { withApollo } from '@apollo/client/react/hoc';
import { Download as IconDownload } from '@styled-icons/feather/Download';
import dayjs from 'dayjs';
import { FormattedMessage } from 'react-intl';

import { exportFile } from '../../lib/export_file';
import { transactionsQuery } from '../../lib/graphql/queries';
import { getFromLocalStorage, LOCAL_STORAGE_KEYS } from '../../lib/local-storage';

import { Box, Flex } from '../Grid';
import Link from '../Link';
import PopupMenu from '../PopupMenu';
import StyledButton from '../StyledButton';
import { getDefaultKinds } from '../transactions/filters/TransactionsKindFilter';

const transformResultInCSV = json => {
  const q = value => `"${value}"`; /* Quote value */
  const f = value => (value / 100).toFixed(2); /* Add cents */
  const d = value => dayjs(new Date(value)).format('YYYY-MM-DD HH:mm:ss');

  // Sanity check. It will return an empty CSV for the user
  if (json.length === 0) {
    return '';
  }

  // All the json lines contain the same values for these two
  // variables. It's save to get them from any index.
  const hostCurrency = json[0].host.currency;
  const collectiveCurrency = json[0].currency;

  const header = [
    'Transaction Description',
    'User Name',
    'User Profile',
    'Transaction Date',
    'Collective Currency',
    'Host Currency',
    'Transaction Amount',
    `Host Fee (${hostCurrency})`,
    `Open Collective Fee (${hostCurrency})`,
    `Payment Processor Fee (${hostCurrency})`,
    `Net Amount (${collectiveCurrency})`,
    'Subscription Interval',
    'Order Date',
    'Tags',
  ].join(',');

  const lines = json.map(i => {
    const profile = `http://opencollective.com/${i.fromCollective.slug}`;
    const subscriptionInterval = i.subscription ? i.subscription.interval : 'one time';
    const expenseTags = i.expense?.tags ? i.expense.tags.join(', ') : '';

    return [
      q(i.description) /* Transaction Description */,
      q(i.fromCollective.name) /* User Name  */,
      q(profile) /* User Profile  */,
      d(i.createdAt) /* Transaction Date  */,
      q(i.currency) /* Currency */,
      q(hostCurrency) /* Host Currency */,
      f(i.amount) /* Transaction Amount */,
      f(i.hostFeeInHostCurrency) /* Host Fee */,
      f(i.platformFeeInHostCurrency) /* Platform Fee */,
      f(i.paymentProcessorFeeInHostCurrency) /* Payment Processor Fee */,
      f(i.netAmountInCollectiveCurrency) /* Net Amount */,
      q(subscriptionInterval) /* Interval of subscription */,
      q(new Date(i.createdAt).toISOString()) /* Order Date */,
      q(expenseTags) /* Tags */,
    ].join(',');
  });

  return [header].concat(lines).join('\n');
};

const TransactionsDownloadCSV = ({ collective, client, query }) => {
  let dateFrom, dateTo;
  if (query.period) {
    [dateFrom, dateTo] = query.period.split('→');
  }

  const type = query.type;

  const kinds = query.kind ? query.kind.split(',') : getDefaultKinds();

  const download = async () => {
    const result = await client.query({
      query: transactionsQuery,
      variables: {
        dateFrom: dateFrom,
        // Extend to end of day
        dateTo: dateTo && dayjs(dateTo).set('hour', 23).set('minute', 59).set('second', 59).toISOString(),
        CollectiveId: collective.legacyId,
        type: type,
        kinds: kinds,
      },
    });
    const csv = transformResultInCSV(result.data.allTransactions);

    // Don't prompt the file download unless there's data coming
    if (csv === '') {
      return;
    }

    // Helper to prepare date values to be part of the file name
    const format = d => dayjs(d).format('YYYY-MM-DD');
    let fileName = `${collective.slug}-from-`;
    fileName += `${format(dateFrom)}-to-`;
    fileName += `${format(dateTo)}.csv`;
    return exportFile('text/plain;charset=utf-8', fileName, csv);
  };

  const downloadV2 = async event => {
    const accessToken = getFromLocalStorage(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);

    if (!accessToken) {
      return;
    }

    event.preventDefault();

    const csv = await fetch(downloadUrl(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).then(response => response.text());

    return exportFile('text/csv;charset=utf-8', `${collective.slug}-transactions.csv`, csv);
  };

  const downloadUrl = () => {
    const format = 'txt';

    const url = new URL(`${process.env.REST_URL}/v2/${collective.slug}/transactions.${format}`);

    if (query.kind) {
      url.searchParams.set('kind', query.kind);
    } else {
      url.searchParams.set('kind', getDefaultKinds().join(','));
    }

    if (query.type) {
      url.searchParams.set('type', query.type);
    }

    if (query.searchTerm) {
      url.searchParams.set('searchTerm', query.searchTerm);
    }

    if (query.amount) {
      if (query.amount.includes('-')) {
        const [minAmount, maxAmount] = query.amount.split('-');
        if (minAmount) {
          url.searchParams.set('minAmount', Number(minAmount) * 100);
        }
        if (maxAmount) {
          url.searchParams.set('maxAmount', Number(maxAmount) * 100);
        }
      } else if (query.amount.includes('+')) {
        const minAmount = query.amount.replace('+', '');
        if (minAmount) {
          url.searchParams.set('minAmount', Number(minAmount) * 100);
        }
      }
    }

    if (dateFrom) {
      url.searchParams.set('dateFrom', dateFrom);
    }
    if (dateTo) {
      url.searchParams.set('dateTo', dateTo);
    }

    if (!query.ignoreGiftCardsTransactions) {
      url.searchParams.set('includeGiftCardTransactions', '1');
    }
    if (!query.ignoreIncognitoTransactions) {
      url.searchParams.set('includeIncognitoTransactions', '1');
    }
    if (!query.ignoreChildrenTransactions) {
      url.searchParams.set('includeChildrenTransactions', '1');
    }

    return url.toString();
  };

  return (
    <Flex flexWrap="wrap" my={['8px', 0]}>
      <PopupMenu
        placement="bottom-end"
        Button={({ onClick }) => (
          <StyledButton
            data-cy="download-csv"
            onClick={onClick}
            buttonSize="small"
            minWidth={140}
            isBorderless
            flexGrow={1}
          >
            <FormattedMessage id="transactions.downloadcsvbutton" defaultMessage="Download CSV" />
            <IconDownload size="13px" style={{ marginLeft: '8px' }} />
          </StyledButton>
        )}
      >
        <Box mx="8px" my="16px" width="190px">
          <small>
            <FormattedMessage
              id="Transactions.DownloadCSV.Description"
              defaultMessage="Use the filters to define the transactions you would like to download."
            />
          </small>
          <br />
          <Link onClick={downloadV2} href={downloadUrl()} openInNewTab={true}>
            <StyledButton data-cy="download-csv-download-v2" buttonSize="tiny" buttonStyle="primary" mt="12px">
              <FormattedMessage id="Download" defaultMessage="Download" /> (v2)
            </StyledButton>
          </Link>
          <StyledButton data-cy="download-csv-download" buttonSize="tiny" onClick={download} mt="12px">
            <FormattedMessage id="Download" defaultMessage="Download" /> (v1)
          </StyledButton>
        </Box>
      </PopupMenu>
    </Flex>
  );
};

TransactionsDownloadCSV.propTypes = {
  onChange: PropTypes.func,
  filters: PropTypes.object,
  collective: PropTypes.shape({
    slug: PropTypes.string,
    legacyId: PropTypes.number.isRequired,
    currency: PropTypes.string.isRequired,
  }).isRequired,
  client: PropTypes.object,
  query: PropTypes.shape({
    type: PropTypes.string,
    kind: PropTypes.string,
    amount: PropTypes.string,
    period: PropTypes.string,
    searchTerm: PropTypes.string,
    ignoreIncognitoTransactions: PropTypes.string,
    ignoreGiftCardsTransactions: PropTypes.string,
    ignoreChildrenTransactions: PropTypes.string,
  }),
};

export default withApollo(TransactionsDownloadCSV);
