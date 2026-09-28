//! The webview can open only the destinations defined in `appConfig.destinations`.

use serde::{Deserialize, Serialize};
use specta::Type;
use url::Url;

use crate::app_config::DESTINATIONS;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum KnownDestination {
    Repository,
    Documentation,
    License,
    Support,
}

impl KnownDestination {
    pub const ALL: [Self; 4] = [Self::Repository, Self::Documentation, Self::License, Self::Support];

    pub fn key(self) -> &'static str {
        match self {
            Self::Repository => "repository",
            Self::Documentation => "documentation",
            Self::License => "license",
            Self::Support => "support",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Repository => "Repository",
            Self::Documentation => "Documentation",
            Self::License => "License",
            Self::Support => "Support",
        }
    }
}

/// The configured HTTPS URL for a destination. Credentials in the URL are rejected.
pub fn url(destination: KnownDestination) -> AppResult<Url> {
    let configured = DESTINATIONS
        .iter()
        .find(|(key, _)| *key == destination.key())
        .map(|(_, value)| *value)
        .ok_or_else(|| AppError::invalid("Invalid destination configuration."))?;
    let url = Url::parse(configured).map_err(|_| AppError::invalid("Invalid destination configuration."))?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::invalid("Invalid destination configuration."));
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_destination_is_configured_as_https() {
        for destination in KnownDestination::ALL {
            assert_eq!(url(destination).unwrap().scheme(), "https");
        }
    }
}
